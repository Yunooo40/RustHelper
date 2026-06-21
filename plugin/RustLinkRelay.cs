// RustLinkRelay — Oxide / Carbon plugin for Rust.
//
// Relays in-game events to the RustLink Bot API via webhook (POST /webhook/rust):
//   • Patrol Helicopter  (spawned / destroyed)   — auto
//   • CH47 Chinook       (spawned / left)         — auto
//   • Cargo Ship         (spawned / left)         — auto
//   • Bradley APC        (spawned / destroyed)    — auto
//
// Phase 3 — in-game chat relay:
//   • Query  : !rl | !timers | !next            (also /rl, /timers, /next)
//              → reads GET /timers?server=<name> and prints active timers in chat.
//   • Report : !small !large !deep !heli !cargo !bradley !chinook
//              or  !report <event>               (also the /-prefixed forms)
//              → players announce events the plugin can't auto-detect (Oil Rig,
//                Deep Sea…). Sent with source:"ingame" + reporter:<player>.
//
// Phase 3.2 — auto Oil Rig: detects when the locked crate on the Small/Large Oil
// Rig starts being hacked (OnCrateHack + monument filter) and posts a countdown to
// unlock automatically. Toggle: "Auto-detect Oil Rig crate hacks".
//
// Repo: https://github.com/Yunooo40/RustHelper
//
// IMPORTANT: Rust updates monthly and entity/hook names can drift. If an event
// stops firing after a Rust update, verify the type names and hook signatures
// against the current uMod docs (https://umod.org/documentation) before assuming
// a bug here. This file is API-compatible with both Oxide and Carbon.

using System;
using System.Collections.Generic;
using System.Linq;
using Newtonsoft.Json;
using Oxide.Core.Libraries;
using Oxide.Core.Libraries.Covalence;
using Oxide.Core.Plugins;
using UnityEngine;

namespace Oxide.Plugins
{
    [Info("RustLink Relay", "Yunooo40", "0.3.0")]
    [Description("Relays Rust events (auto + in-game reports/queries) to the RustLink Bot API.")]
    public class RustLinkRelay : RustPlugin
    {
        // ───────────────────────────── Configuration ─────────────────────────────
        private Configuration config;

        private class EventOption
        {
            [JsonProperty("Enabled")]
            public bool Enabled = true;

            // Estimated minutes until the next occurrence — used to show a countdown
            // in Discord (sent as "next_respawn"). 0 = don't send an estimate.
            [JsonProperty("Respawn estimate (minutes)")]
            public int RespawnMinutes = 0;
        }

        private class Configuration
        {
            [JsonProperty("Webhook URL")]
            public string WebhookUrl = "http://localhost:3000/webhook/rust";

            [JsonProperty("API base URL (in-game queries; empty = derive from Webhook URL)")]
            public string ApiBaseUrl = "";

            [JsonProperty("Webhook secret (x-webhook-secret header, empty = none)")]
            public string WebhookSecret = "";

            [JsonProperty("Server name (MUST match /setup in Discord)")]
            public string ServerName = "My Rust Server";

            [JsonProperty("Request timeout (seconds)")]
            public int TimeoutSeconds = 10;

            [JsonProperty("Debug logging")]
            public bool Debug = false;

            // ── In-game chat commands (Phase 3) ──
            [JsonProperty("Chat commands enabled")]
            public bool EnableChatCommands = true;

            [JsonProperty("Chat prefix for '!' style (the '/' forms always work)")]
            public string ChatPrefix = "!";

            [JsonProperty("Reports: admin only")]
            public bool ReportsAdminOnly = false;

            [JsonProperty("Reports: per-player cooldown (seconds)")]
            public int ReportCooldownSeconds = 60;

            [JsonProperty("Reports: timer minutes per event (0 = announce only, no timer)")]
            public Dictionary<string, int> ReportMinutes = new Dictionary<string, int>
            {
                ["oil_rig_small"] = 15,
                ["oil_rig_large"] = 15,
                ["deep_sea"] = 0,
                ["helicopter"] = 0,
                ["cargo"] = 0,
                ["bradley"] = 0,
                ["chinook"] = 0,
            };

            // ── Oil Rig auto-detect (Phase 3.2) ──
            [JsonProperty("Auto-detect Oil Rig crate hacks (verify on a live server)")]
            public bool AutoOilRig = true;

            [JsonProperty("Events")]
            public Dictionary<string, EventOption> Events = new Dictionary<string, EventOption>
            {
                ["helicopter"] = new EventOption { Enabled = true, RespawnMinutes = 0 },
                ["chinook"] = new EventOption { Enabled = true, RespawnMinutes = 0 },
                ["cargo"] = new EventOption { Enabled = true, RespawnMinutes = 0 },
                ["bradley"] = new EventOption { Enabled = true, RespawnMinutes = 60 },
            };
        }

        protected override void LoadDefaultConfig() => config = new Configuration();

        protected override void LoadConfig()
        {
            base.LoadConfig();
            try
            {
                config = Config.ReadObject<Configuration>();
                if (config == null) throw new Exception("config is null");
            }
            catch
            {
                PrintWarning("Configuration invalid or missing — writing a fresh default config.");
                LoadDefaultConfig();
            }
            SaveConfig();
        }

        protected override void SaveConfig() => Config.WriteObject(config);

        // ───────────────────────────── Lifecycle ─────────────────────────────
        // Ignore the burst of entity spawns right after the server boots / the plugin
        // (re)loads, so we don't fire "spawned" for pre-existing entities such as the
        // Bradley APC sitting at the launch site.
        private bool ready = false;

        // Per-player report cooldown (player id -> last report time, UTC).
        private readonly Dictionary<string, DateTime> lastReport = new Dictionary<string, DateTime>();

        private void OnServerInitialized()
        {
            timer.Once(10f, () =>
            {
                ready = true;
                if (config.Debug) Puts("Warmup complete — now relaying spawn events.");
            });
            Puts($"RustLink Relay loaded. Target: {config.WebhookUrl} (server '{config.ServerName}').");
        }

        // ───────────────────────────── Auto hooks ─────────────────────────────
        // NB perf : OnEntitySpawned est l'un des hooks les plus sollicités de Rust
        // (appelé à chaque spawn d'entité). On sort au plus tôt et Classify ne fait
        // que quelques type-checks ; sur un très gros serveur, surveiller le coût.
        private void OnEntitySpawned(BaseNetworkable entity)
        {
            if (!ready || entity == null) return;
            string type = Classify(entity);
            if (type != null) SendEvent(type, "spawned");
        }

        // Killable entities destroyed in combat.
        private void OnEntityDeath(BaseCombatEntity entity, HitInfo info)
        {
            if (entity == null) return;
            if (entity is PatrolHelicopter) SendEvent("helicopter", "destroyed", withRespawn: true);
            else if (entity is BradleyAPC) SendEvent("bradley", "destroyed", withRespawn: true);
        }

        // Entities that despawn without "dying" (cargo leaves, chinook flies away).
        private void OnEntityKill(BaseNetworkable entity)
        {
            if (entity == null) return;
            if (entity is CargoShip) SendEvent("cargo", "left", withRespawn: true);
            else if (entity is CH47Helicopter) SendEvent("chinook", "left");
        }

        private string Classify(BaseNetworkable entity)
        {
            if (entity is PatrolHelicopter) return "helicopter";
            if (entity is CH47Helicopter) return "chinook";
            if (entity is CargoShip) return "cargo";
            if (entity is BradleyAPC) return "bradley";
            return null;
        }

        // ───────────────────── Oil Rig crate hack (Phase 3.2) ─────────────────────
        // Fires when a player STARTS hacking a locked crate. We only care about the
        // crate sitting on the Small / Large Oil Rig — the heli- and cargo-dropped
        // crates are filtered out by monument proximity. Sent as an auto event
        // (source omitted → API stores source='webhook'), with a countdown to unlock.
        //
        // DRIFT WARNING (Rust updates monthly): the hook name `OnCrateHack`, the type
        // `HackableLockedCrate`, its timing fields, and the monument names below can
        // all change. Everything is guarded; verify on a live server (enable Debug).
        private void OnCrateHack(HackableLockedCrate crate)
        {
            if (!config.AutoOilRig || crate == null) return;

            string ev = WhichOilRig(crate.transform.position);
            if (ev == null)
            {
                if (config.Debug) Puts("Crate hack ignored (not on an Oil Rig).");
                return;
            }

            long now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
            long remaining = OilRigUnlockSeconds(crate, ev);
            long? next = remaining > 0 ? now + remaining : (long?)null;

            if (config.Debug) Puts($"Oil Rig crate hack detected: {ev}, unlock in {remaining}s.");
            PostEvent(ev, "called", now, next, source: null, reporter: null);
        }

        // Which Oil Rig (if any) contains this world position. Null = not an Oil Rig.
        private string WhichOilRig(Vector3 pos)
        {
            var monuments = TerrainMeta.Path?.Monuments;
            if (monuments == null) return null;
            foreach (var mon in monuments)
            {
                if (mon == null || !mon.IsInBounds(pos)) continue;
                string n = (mon.name ?? "").ToLowerInvariant();
                if (n.Contains("oilrig_1") || n.Contains("oil_rig_1")) return "oil_rig_small";
                if (n.Contains("oilrig_2") || n.Contains("oil_rig_2")) return "oil_rig_large";
            }
            return null;
        }

        // Seconds until the crate unlocks. Reads the crate's own timer when possible,
        // else falls back to the configured ReportMinutes (then 900 s = 15 min).
        private long OilRigUnlockSeconds(HackableLockedCrate crate, string ev)
        {
            try
            {
                float remaining = crate.requiredHackSeconds - crate.hackSeconds;
                if (remaining > 0f) return (long)remaining;
            }
            catch { /* field drift — fall back below */ }

            int minutes;
            if (config.ReportMinutes.TryGetValue(ev, out minutes) && minutes > 0)
                return minutes * 60L;
            return 900L;
        }

        // ───────────────────────── In-game chat commands ─────────────────────────
        // Player-typed tokens → canonical event keys understood by the API.
        private static readonly Dictionary<string, string> ReportShortcuts = new Dictionary<string, string>
        {
            ["small"] = "oil_rig_small",
            ["large"] = "oil_rig_large",
            ["deep"] = "deep_sea",
            ["heli"] = "helicopter",
            ["cargo"] = "cargo",
            ["bradley"] = "bradley",
            ["chinook"] = "chinook",
        };

        private static readonly Dictionary<string, string> Labels = new Dictionary<string, string>
        {
            ["oil_rig_small"] = "Small Oil Rig",
            ["oil_rig_large"] = "Large Oil Rig",
            ["deep_sea"] = "Deep Sea Loot",
            ["helicopter"] = "Patrol Helicopter",
            ["cargo"] = "Cargo Ship",
            ["chinook"] = "Chinook (CH47)",
            ["bradley"] = "Bradley APC",
        };

        // Covalence commands → work via "/rl", "/small", etc.
        [Command("rl", "timers", "next")]
        private void CmdTimers(IPlayer player, string command, string[] args) => DoQuery(player);

        [Command("report")]
        private void CmdReport(IPlayer player, string command, string[] args)
        {
            if (args.Length == 0)
            {
                player.Reply("Usage: report <small|large|deep|heli|cargo|bradley|chinook>");
                return;
            }
            DoReport(player, args[0]);
        }

        [Command("small")] private void CmdSmall(IPlayer p, string c, string[] a) => DoReport(p, "small");
        [Command("large")] private void CmdLarge(IPlayer p, string c, string[] a) => DoReport(p, "large");
        [Command("deep")] private void CmdDeep(IPlayer p, string c, string[] a) => DoReport(p, "deep");
        [Command("heli")] private void CmdHeli(IPlayer p, string c, string[] a) => DoReport(p, "heli");
        [Command("bradley")] private void CmdBradley(IPlayer p, string c, string[] a) => DoReport(p, "bradley");
        [Command("chinook")] private void CmdChinook(IPlayer p, string c, string[] a) => DoReport(p, "chinook");

        // "!" style prefix → parsed from raw chat (the configurable RustLink convention).
        private object OnUserChat(IPlayer player, string message)
        {
            if (!config.EnableChatCommands || string.IsNullOrEmpty(message)) return null;
            string prefix = string.IsNullOrEmpty(config.ChatPrefix) ? "!" : config.ChatPrefix;
            if (!message.StartsWith(prefix)) return null;

            var parts = message.Substring(prefix.Length)
                .Trim()
                .Split(new[] { ' ' }, StringSplitOptions.RemoveEmptyEntries);
            if (parts.Length == 0) return null;

            string cmd = parts[0].ToLowerInvariant();
            if (cmd == "rl" || cmd == "timers" || cmd == "next") { DoQuery(player); return true; }
            if (cmd == "report")
            {
                if (parts.Length < 2) player.Reply("Usage: " + prefix + "report <event>");
                else DoReport(player, parts[1]);
                return true;
            }
            if (ReportShortcuts.ContainsKey(cmd)) { DoReport(player, cmd); return true; }
            return null; // not our command → let normal chat / other plugins handle it
        }

        // ── Query: read active timers from the API and reply in chat ──
        private void DoQuery(IPlayer player)
        {
            if (!config.EnableChatCommands) return;

            string url = ApiBase() + "/timers?server=" + Uri.EscapeDataString(config.ServerName);
            var headers = new Dictionary<string, string> { ["Content-Type"] = "application/json" };
            if (!string.IsNullOrEmpty(config.WebhookSecret))
                headers["x-webhook-secret"] = config.WebhookSecret;

            webrequest.Enqueue(url, null, (code, response) =>
            {
                if (code < 200 || code >= 300)
                {
                    player.Reply("RustLink: could not reach the API.");
                    if (config.Debug) PrintWarning($"GET timers HTTP {code}: {response}");
                    return;
                }
                try
                {
                    var data = JsonConvert.DeserializeObject<TimersResponse>(response);
                    long now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
                    var lines = new List<string>();
                    if (data?.Timers != null)
                    {
                        foreach (var t in data.Timers.OrderBy(x => x.ExpiresAt))
                        {
                            if (t.ExpiresAt <= now) continue; // skip expired
                            lines.Add($"• {Label(t.EventType)} — in {Countdown(t.ExpiresAt - now)}");
                        }
                    }
                    player.Reply(lines.Count == 0
                        ? "RustLink: no active timers."
                        : "RustLink timers:\n" + string.Join("\n", lines));
                }
                catch (Exception e)
                {
                    player.Reply("RustLink: error reading timers.");
                    if (config.Debug) PrintWarning("Parse error: " + e.Message);
                }
            }, this, RequestMethod.GET, headers, config.TimeoutSeconds * 1000f);
        }

        // ── Report: a player announces an event the plugin can't auto-detect ──
        private void DoReport(IPlayer player, string token)
        {
            if (!config.EnableChatCommands) return;
            if (config.ReportsAdminOnly && !player.IsAdmin)
            {
                player.Reply("You are not allowed to report events.");
                return;
            }
            if (OnCooldown(player))
            {
                player.Reply($"Please wait before reporting again (cooldown {config.ReportCooldownSeconds}s).");
                return;
            }

            string key = token.ToLowerInvariant();
            string canonical;
            if (!ReportShortcuts.TryGetValue(key, out canonical)) canonical = key;

            int minutes;
            config.ReportMinutes.TryGetValue(canonical, out minutes);

            long now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
            long? next = minutes > 0 ? now + minutes * 60L : (long?)null;

            // Send the raw token (e.g. "small"); the API canonicalises it via resolveEvent.
            PostEvent(key, "called", now, next, source: "ingame", reporter: player.Name);
            lastReport[player.Id] = DateTime.UtcNow;
            player.Reply($"Reported '{key}' to RustLink. Thanks!");
        }

        private bool OnCooldown(IPlayer player)
        {
            DateTime last;
            if (lastReport.TryGetValue(player.Id, out last))
                return (DateTime.UtcNow - last).TotalSeconds < config.ReportCooldownSeconds;
            return false;
        }

        private string ApiBase()
        {
            if (!string.IsNullOrEmpty(config.ApiBaseUrl)) return config.ApiBaseUrl.TrimEnd('/');
            string u = config.WebhookUrl ?? "";
            int idx = u.IndexOf("/webhook", StringComparison.OrdinalIgnoreCase);
            return idx > 0 ? u.Substring(0, idx) : u.TrimEnd('/');
        }

        private string Label(string key)
        {
            string l;
            return Labels.TryGetValue(key, out l) ? l : key;
        }

        private string Countdown(long s)
        {
            if (s <= 0) return "now";
            long h = s / 3600;
            long m = (s % 3600) / 60;
            return h > 0 ? $"{h}h {m}m" : $"{m}m";
        }

        // ───────────────────────────── Webhook sender ─────────────────────────────
        // Auto events: gated by config.Events and their respawn estimate.
        private void SendEvent(string eventType, string status, bool withRespawn = false)
        {
            EventOption opt;
            if (!config.Events.TryGetValue(eventType, out opt))
            {
                if (config.Debug) Puts($"Event '{eventType}' absent de la config — ignoré.");
                return;
            }
            if (!opt.Enabled) return;

            long now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
            long? nextRespawn = null;
            // Le countdown estime la PROCHAINE occurrence : on ne le pose qu'à la
            // fin d'un event (mort/départ, withRespawn), pas au spawn.
            if (opt.RespawnMinutes > 0 && withRespawn)
                nextRespawn = now + opt.RespawnMinutes * 60L;

            PostEvent(eventType, status, now, nextRespawn, source: null, reporter: null);
        }

        // Low-level POST shared by auto events and in-game reports.
        // `source`/`reporter` are omitted for auto events (API then defaults source='webhook').
        private void PostEvent(string eventKey, string status, long now, long? nextRespawn,
            string source, string reporter)
        {
            var payload = new Dictionary<string, object>
            {
                ["server"] = config.ServerName,
                ["event"] = eventKey,
                ["status"] = status,
                ["spawn_time"] = now,
                ["timestamp"] = DateTime.UtcNow.ToString("o"),
            };
            if (nextRespawn.HasValue) payload["next_respawn"] = nextRespawn.Value;
            if (!string.IsNullOrEmpty(source)) payload["source"] = source;
            if (!string.IsNullOrEmpty(reporter)) payload["reporter"] = reporter;

            string body = JsonConvert.SerializeObject(payload);
            var headers = new Dictionary<string, string> { ["Content-Type"] = "application/json" };
            if (!string.IsNullOrEmpty(config.WebhookSecret))
                headers["x-webhook-secret"] = config.WebhookSecret;

            if (config.Debug) Puts($"-> {eventKey}/{status}: {body}");

            webrequest.Enqueue(config.WebhookUrl, body, (code, response) =>
            {
                if (code < 200 || code >= 300)
                    PrintWarning($"Webhook failed ({eventKey}/{status}) HTTP {code}: {response}");
                else if (config.Debug)
                    Puts($"Webhook ok ({eventKey}/{status}) HTTP {code}.");
            }, this, RequestMethod.POST, headers, config.TimeoutSeconds * 1000f);
        }

        // DTOs for parsing GET /timers.
        private class TimersResponse
        {
            [JsonProperty("ok")] public bool Ok;
            [JsonProperty("timers")] public List<TimerDto> Timers;
        }

        private class TimerDto
        {
            [JsonProperty("event_type")] public string EventType;
            [JsonProperty("expires_at")] public long ExpiresAt;
            [JsonProperty("status")] public string Status;
        }

        // ───────────────────────────── Test command ─────────────────────────────
        // Run from the server console / RCON:
        //   rustlink.test                 -> sends "bradley / destroyed" (creates a timer)
        //   rustlink.test helicopter spawned
        // Lets you verify connectivity to the API without spawning real entities.
        [ConsoleCommand("rustlink.test")]
        private void CmdTest(ConsoleSystem.Arg arg)
        {
            // Allow from server console/RCON (no player) or in-game admins only.
            var player = arg.Player();
            if (player != null && !player.IsAdmin) return;

            string ev = arg.GetString(0, "bradley");
            string status = arg.GetString(1, "destroyed");
            Puts($"Sending test event '{ev}/{status}' -> {config.WebhookUrl}");
            SendEvent(ev, status, withRespawn: true);
        }
    }
}
