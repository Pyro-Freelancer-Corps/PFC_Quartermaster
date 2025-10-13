# Star Citizen Discord Adventure — System Design Document (v0.4)

*Last updated: {{DATE}}*

> Updated to remove the non-goals section. Focus remains on text-based gameplay with private player channels.

---

## 1. Objectives

### 1.1 Goals

* **Persistent shared world**, visible to all players through mirrored events.
* **Private player channels** (per-player text channels) as the player’s cockpit.
* **Auto-destroy** inactive player channels (configurable TTL).
* **Persistent player/world state** across sessions.
* **Live presence**: entering/leaving/speaking reflected in every occupant’s channel.
* **Data-driven content** (YAML packs), supporting expansions and hot reload.

---

## 2. System Overview

```
Discord Guild
  ├─ #adventure (admin-visible parent category)
  │   └─ cockpit-<player> channels (private, temporary)
  ├─ #adventure-content (for writers to upload packs)
  ├─ #adventure-ops (logs, alerts)

Bot (discord.js)
  ├─ Command Layer (/spawn, /look, /go, /say, etc.)
  ├─ Engine (state, queues, presence, broadcast)
  ├─ Content Loader (YAML packs)
  └─ Persistence (SQLite → Postgres later)
```

---

## 3. State Model

### 3.1 Scopes

| Scope  | Description                       | Example           |
| ------ | --------------------------------- | ----------------- |
| World  | Affects all players globally      | power grid online |
| Room   | Affects everyone in that location | crate opened      |
| Player | Affects only that player          | knows launch code |

### 3.2 Data Structures

```jsonc
// world_state
{
  "rooms": { "arc:market": { "crate_17_opened": true } },
  "version": 2
}

// player_state
{
  "userId": "123",
  "location": "arc:landing_pad",
  "flags": ["scanned_hull"],
  "inventory": {"medgel": 2}
}
```

### 3.3 Presence Index

* `room_occupants: Map<RoomID, Set<UserID>>`
* `user_room: Map<UserID, RoomID>`
* `user_channel: Map<UserID, ChannelID>`

Broadcasts route through these maps for live updates.

---

## 4. Discord Integration

### 4.1 Private Channels

Each player gets a private channel under the adventure category:

* Visible only to the player, bot, and admins.
* Created on `/adventure_spawn`.
* Deleted automatically after **inactivity TTL** (default: 10 min).

Permissions:

```js
{ id: guild.roles.everyone, deny: ['ViewChannel'] },
{ id: bot.user.id, allow: ['ViewChannel','SendMessages','ManageChannels'] },
{ id: player.id, allow: ['ViewChannel','SendMessages'] },
{ id: adminRole.id, allow: ['ViewChannel','ManageMessages'] }
```

### 4.2 Lifecycle

* **Spawn** → create channel, place player in last saved room.
* **Activity** → any command resets TTL timer.
* **Idle** → destroy channel, unbind from player, preserve save.
* **Despawn** → player manually closes channel (`/adventure_despawn`).
* **Rejoin** → new channel created, state restored.

### 4.3 Broadcasts & Presence

When events occur:

* Departures and arrivals are posted in every occupant’s channel.
* Speech and visible actions broadcast to same-room channels.
* Ephemeral replies reserved for private info (e.g. “You find a key”).

Example:

```
← @Rory.O arrives from the south.
🗨️ @Rory.O: “You call this a landing?”
```

### 4.4 Admin Controls

* Admins can list active cockpits, force despawn, or reload content packs.
* Ops logs all channel creation/deletion.

---

## 5. Engine Architecture

### 5.1 Core Modules

| Module              | Purpose                                         |
| ------------------- | ----------------------------------------------- |
| **Presence**        | Tracks user → room → channel mapping            |
| **Engine**          | Command routing, broadcast fan-out, room queues |
| **StateRepo**       | Persistence layer, atomic commits               |
| **ContentLoader**   | YAML parsing, validation, reload                |
| **ActivityMonitor** | Handles channel idle timers                     |

### 5.2 Per-room Queues

Each room has a FIFO queue for mutating actions, ensuring deterministic results.

```js
roomQueues.get(roomId) → Promise chain
```

### 5.3 Cooldowns

Per-user cooldown (0.5–1.0 s) on commands to throttle spam.

---

## 6. Content System

### 6.1 Structure

```
content/
  core_stanton/
    pack.yaml
    maps/*.yaml
    items.yaml
    quests.yaml
```

### 6.2 YAML Example

```yaml
rooms:
  arc:landing_pad:
    name: "ArcCorp Landing Pad C"
    desc: |
      Wind knifes across the cracked tarmac. Your ship sulks in pieces.
    exits: { north: arc:market }
```

### 6.3 Validation

* Schema + referential checks.
* Detect missing exits, cyclic links, scope misuse.
* Reject unsafe YAML types.

---

## 7. File Upload Flow

1. Writer uploads `.zip` or `.yaml` in `#adventure-content`.
2. Bot validates pack, reports pass/fail embed.
3. Valid packs merged into `content/`, hot reloaded.
4. Invalid packs rejected with diagnostic summary.

---

## 8. Error Handling

* User errors → friendly ephemeral messages.
* Engine errors → logged with stack + room context.
* Content errors → logged in `#adventure-ops`.

---

## 9. Testing & Deployment

* Unit: state ops, broadcast, queue serialization.
* Integration: spawn/despawn, go/look/say.
* Load test: simulate 100+ players moving concurrently.
* Deploy via PM2 or Docker; persist DB volume.

---

## 10. Roadmap

| Phase       | Highlights                                                                                            |
| ----------- | ----------------------------------------------------------------------------------------------------- |
| **1 (MVP)** | Private channels, state persistence, 15-room ArcCorp map, `/spawn`, `/go`, `/say`, content validation |
| **2**       | Inventory, quests, content hot reload                                                                 |
| **3**       | Factions, multi-system expansion                                                                      |

---

## 11. Config Defaults

| Setting         | Default            |
| --------------- | ------------------ |
| Idle TTL        | 10 minutes         |
| Parent Category | #adventure         |
| Upload Channel  | #adventure-content |
| Ops Channel     | #adventure-ops     |

---

## 12. Glossary

* **Cockpit Channel**: player’s private channel.
* **Presence**: mapping of user → room → channel.
* **Scope**: data layer (world, room, player).
* **Queue**: serialized executor per room.

---

**Change Log**

* *v0.4* — removed non-goals section.
* *v0.3* — removed all voice/TTS references; text-only model.
* *v0.2* — switched to private channels, clarified lifecycle & permissions.
* *v0.1* — initial thread-based model.
