// RustLinkRelay — Oxide / Carbon plugin for Rust.
//
// Relays in-game events to the RustLink Bot API via webhook (POST /webhook/rust):
//   • Patrol Helicopter  (spawned / destroyed)
//   • CH47 Chinook       (spawned / left)
//   • Cargo Ship         (spawned / left)
//   • Bradley APC        (spawned / destroyed)
//
// Repo: https://github.com/Yunooo40/RustHelper
//
// IMPORTANT: Rust updates monthly and entity/hook names can drift. If an event
// stops firing after a Rust update, verify the type names and hook signatures
// against the current uMod docs (https://umod.org/documentation) before assuming
// a bug here. This file is API-compatible with both Oxide and Carbon.

using System;
using System.Collections.Generic;
using Newtonsoft.Json;
using Oxide.Core.Libraries;
using Oxide.Core.Plugins;

namespace Oxide.Plugins
{
    [Info("RustLink Relay", "Yunooo40", "0.1.0")]
    [Description("Relays Rust events (Heli, Chinook, Cargo, Bradley) to the RustLink Bot API.")]
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

            [JsonProperty("Webhook secret (x-webhook-secret header, empty = none)")]
            public string WebhookSecret = "";

            [JsonProperty("Server name (MUST match /setup in Discord)")]
            public string ServerName = "My Rust Server";

            [JsonProperty("Request timeout (seconds)")]
            public int TimeoutSeconds = 10;

            [JsonProperty("Debug logging")]
            public bool Debug = false;

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

        private void OnServerInitialized()
        {
            timer.Once(10f, () =>
            {
                ready = true;
                if (config.Debug) Puts("Warmup complete — now relaying spawn events.");
            });
            Puts($"RustLink Relay loaded. Target: {config.WebhookUrl} (server '{config.ServerName}').");
        }

        // ───────────────────────────── Hooks ─────────────────────────────
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

        // ───────────────────────────── Webhook sender ─────────────────────────────
        private void SendEvent(string eventType, string status, bool withRespawn = false)
        {
            EventOption opt;
            if (!config.Events.TryGetValue(eventType, out opt) || !opt.Enabled) return;

            long now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
            long? nextRespawn = null;
            if (opt.RespawnMinutes > 0 && (withRespawn || status == "spawned"))
                nextRespawn = now + opt.RespawnMinutes * 60L;

            var payload = new Dictionary<string, object>
            {
                ["server"] = config.ServerName,
                ["event"] = eventType,
                ["status"] = status,
                ["spawn_time"] = now,
                ["timestamp"] = DateTime.UtcNow.ToString("o"),
            };
            if (nextRespawn.HasValue) payload["next_respawn"] = nextRespawn.Value;

            string body = JsonConvert.SerializeObject(payload);
            var headers = new Dictionary<string, string> { ["Content-Type"] = "application/json" };
            if (!string.IsNullOrEmpty(config.WebhookSecret))
                headers["x-webhook-secret"] = config.WebhookSecret;

            if (config.Debug) Puts($"-> {eventType}/{status}: {body}");

            webrequest.Enqueue(config.WebhookUrl, body, (code, response) =>
            {
                if (code < 200 || code >= 300)
                    PrintWarning($"Webhook failed ({eventType}/{status}) HTTP {code}: {response}");
                else if (config.Debug)
                    Puts($"Webhook ok ({eventType}/{status}) HTTP {code}.");
            }, this, RequestMethod.POST, headers, config.TimeoutSeconds * 1000f);
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
