-- One-time extractor validation: dump the ACTUAL post-setup state of the
-- Brass: Birmingham TTS mod so we can diff it against our extracted golden
-- (games/brass-birmingham/golden/mod-setup.json).
--
-- How to run (once per player count you want to validate; 2p is enough):
--   1. Open the mod save in Tabletop Simulator.
--   2. In the chat, start a fake game:  /execute start(2)
--   3. Wait for setup to finish (cards dealt, merchants placed, links bagged).
--   4. Paste this whole file into the chat prefixed with /execute, or save it
--      and run it via the console. It prints JSON between DUMP-BEGIN/END
--      markers into the system log (Help > Log, or Documents\My Games\
--      Tabletop Simulator\TabletopSimulator.log).
--   5. Copy the JSON into games/brass-birmingham/golden/tts-dump.json and run
--      node tools/tts-extract/validate-dump.mjs
--
-- Standalone on purpose: it reads the table via raw GUIDs, not the mod's own
-- code, so it independently witnesses what the mod's setup produced.

local function guid_obj(g) return getObjectFromGUID(g) end

local COLORS = { "Orange", "Purple", "Teal", "Yellow" }

local COAL_ZONES = { "3c5ffd", "14aada", "ec2671", "39e20b", "56e563", "2e35ed", "6c1ee9", "bb3394", "d49b68", "14a883", "32a943", "165cc2", "1fb80c", "2ff284" }
local IRON_ZONES = { "550e2a", "581ae8", "6581f5", "6c2b6d", "3bcd07", "2734e8", "0a7292", "2beec8", "ffd4d0", "ed2fdc" }

local TRACK_ZONES = {
   "f2074f", "2b8c8a", "b75c1a", "66d962", "1324f5", "37940b", "1b3c0a", "4796e2", "e04d51", "54e6a9",
   "f9ae21", "de4170", "a12840", "aa4dd4", "0f6808", "cad61b", "a509b7", "6f2d85", "1827b2", "81c467",
   "b7cca3", "3f0cb2", "dbdda8", "a30e95", "d53c52", "5c080b", "664292", "521cbd", "1c0ce7", "4efb9f",
   "b75c8f", "b2e4d8", "cccda5", "432e13", "38bbe6", "d25ee0", "aef11e", "4c8952", "30534b", "acbfe8",
   "31937d", "989c9e", "bb92aa", "8d54fb", "fa3a9f", "d4bf75", "388124", "fa77cb", "cf8e95", "4cfc99",
   "2f99d1", "7ce05d", "7a9b26", "f57c65", "7545fe", "635261", "1ca0be", "2eadcd", "2f96ab", "17a06f",
   "083a7c", "80d90e", "c5369e", "052676", "bffa84", "952598", "ea7ce4", "f05e47", "cffcce", "eb1084",
   "58fbc3", "9a5110", "9c1585", "e9bf39", "cdb362", "3eec34", "d14f1d", "d2588c", "21bbb7", "b2a364",
   "38fc99", "5bf198", "97dbc2", "5a45be", "8944ae", "8b4d2f", "d36f07", "d9c3e5", "fd513a", "2ffeb2",
   "dfd2d8", "b9402a", "e6a17b", "ec970d", "ded76c", "f74296", "2ac41f", "065de7", "2e57c0", "710a1a",
}

local MERCHANTS = {
   { loc = "Oxford",     merchant = "698532", beer = "3000f5" },
   { loc = "Oxford",     merchant = "ab9bbd", beer = "34fecd" },
   { loc = "Gloucester", merchant = "4e20da", beer = "d70f79" },
   { loc = "Gloucester", merchant = "db6a73", beer = "876452" },
   { loc = "Shrewsbury", merchant = "dadd84", beer = "8e91f0" },
   { loc = "Warrington", merchant = "2b3380", beer = "58bce3" },
   { loc = "Warrington", merchant = "88aa38", beer = "12290c" },
   { loc = "Nottingham", merchant = "b44318", beer = "1b3e88" },
   { loc = "Nottingham", merchant = "eefd28", beer = "1f418b" },
}

local PLAY_DECK_ZONE = "497481"

local function zone_gm_notes(zone_guid)
   local zone = guid_obj(zone_guid)
   local out = { }
   if zone == nil then return out end
   for _, obj in ipairs(zone.getObjects()) do
      table.insert(out, { name = obj.name, gm = obj.getGMNotes(), nick = obj.getName() })
   end
   return out
end

local function count_resource(zone_guids, resource)
   local fill = { }
   for i, zg in ipairs(zone_guids) do
      local n = 0
      for _, obj in ipairs(zone_gm_notes(zg)) do
         if obj.gm == resource then n = n + 1 end
      end
      fill[i] = n
   end
   return fill
end

local function track_offset(marker_gm)
   for i, zg in ipairs(TRACK_ZONES) do
      for _, obj in ipairs(zone_gm_notes(zg)) do
         if obj.gm == marker_gm then return i - 1 end
      end
   end
   return -1
end

local dump = { }

-- Markets after setup.
dump.coal_fill = count_resource(COAL_ZONES, "Coal")
dump.iron_fill = count_resource(IRON_ZONES, "Iron")

-- Hands: count + card cell ids (identity without exposing order).
dump.hands = { }
for _, color in ipairs(COLORS) do
   local player = Player[color]
   local cards = { }
   if player ~= nil then
      for _, obj in ipairs(player.getHandObjects()) do
         table.insert(cards, obj.getData().CardID)
      end
   end
   if #cards > 0 then
      table.sort(cards)
      dump.hands[color] = cards
   end
end

-- Remaining draw deck: size + sorted cell ids.
dump.deck = { }
for _, obj in ipairs(zone_gm_notes(PLAY_DECK_ZONE)) do
   if obj.name == "Deck" then
      local zone = guid_obj(PLAY_DECK_ZONE)
      for _, z in ipairs(zone.getObjects()) do
         if z.name == "Deck" then
            local ids = { }
            for _, card in ipairs(z.getData().ContainedObjects) do
               table.insert(ids, card.CardID)
            end
            table.sort(ids)
            dump.deck = { size = #ids, cells = ids }
         end
      end
   end
end

-- Merchants: what tile landed on each slot, and whether beer was placed.
dump.merchants = { }
for i, m in ipairs(MERCHANTS) do
   local tile_gm = nil
   for _, obj in ipairs(zone_gm_notes(m.merchant)) do
      if obj.gm ~= nil and obj.gm ~= "" then tile_gm = obj.gm end
   end
   local has_beer = false
   for _, obj in ipairs(zone_gm_notes(m.beer)) do
      if obj.gm == "Beer" then has_beer = true end
   end
   dump.merchants[i] = { loc = m.loc, tile = tile_gm, beer = has_beer }
end

-- Marker start offsets on the track.
dump.markers = { }
for _, color in ipairs(COLORS) do
   local income = track_offset(color .. " Income Marker")
   local score = track_offset(color .. " Victory Points")
   if income >= 0 or score >= 0 then
      dump.markers[color] = { income = income, score = score }
   end
end

local payload = JSON.encode(dump)

log("DUMP-BEGIN")
log(payload)
log("DUMP-END")

-- Send the dump back to the local bridge (tools/tts-extract/dump-server.mjs).
WebRequest.put("http://localhost:8799/result", payload, function(r)
   if r.is_error then
      print("Dump upload failed (" .. tostring(r.error) .. ") — it is still in the system log between DUMP-BEGIN/END.")
   else
      print("Setup dump delivered. You're done in TTS.")
   end
end)

-- When run via the carrier object (TTS chat can't load() scripts, so the
-- bootstrap spawns a block and sets this as its script), clean the block up.
if self ~= nil and self ~= Global then
   Wait.time(function() self.destruct() end, 2)
end
