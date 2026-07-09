ALL_COLORS = {'Red', 'Blue', 'Orange', 'Green', 'White', 'Brown', 'Yellow', 'Teal', 'Purple', 'Pink'}
VALID_COLORS = {'Red', 'Blue', 'Orange', 'Green'}

--Build list of objects to watch
objectsToWatch = {"Solaris", "Water", "Spice", "Intrigue"}

-- A list of the resources in the Gather-O-Mat, in the order you want them to appear
resources = objectsToWatch

-- GUIDS for bags that produce the resources
source_guid = resourceBags

conflictZones = {"692568", "8be699", "789069"}
imperiumDeckZone = "ad3c5a"
intrigueDeckZone = "e9f30d"

--imperiumRow = {"85a5fe", "52cc32", "2f3821", "a4f598", "b17148"}
imperiumRow = {"b17148", "a4f598", "2f3821", "52cc32", "85a5fe"}
influenceZones = {"799d77", "0de027", "4a0d84", "75ce34"}

hiddenPlayerZones = {"6e6944", "b1eaa5", "73df06", "dda0f6"}

--Immortality Setup
researchDeckZone = "f8befb"
researchRow = {"fb42f0", "7954ec"}
researchTokens = {"620e3e", "95be90", "4a1180", "6c8158"}

--Red, Blue, Orange and Green
influenceFremen = {0,0,0,0}
influenceBene = {0,0,0,0}
influenceGuild = {0,0,0,0}
influenceEmperor = {0,0,0,0}

reserveRow = {"71a8c3", "10ddcb", "abef9a"}
conflictDeckLocation = {-3.27, 3, -3.27}
trashBin = "288283"
firstPlayerToken = "784534"
playSeat = {0,0,0,0}
rivals = {0,0,0,0}
rivalColor = ""
selectedRivalsSave = {0,0,0,0}
rivalBoards = {"a0fa97", "042887", "e435ab", "f8a49f"}
boardZone = {"bd39f6", "9b4f33", "bd5bf6", "231215"}

defaultColorList = {"Red", "Blue", "Orange", "Green"}
colorRef = {["Red"] = 1, ["Blue"] = 2, ["Orange"] = 3, ["Green"] = 4}

hagalBag = "aaec7d"
hagalSpot = 0
hagalSpots = {{-40.00, 2, -12.89},{-15.00, 2, -12.89},{15.00, 2, -12.89},{40.00, 2, -12.89}}
hagalRot = {{0.00, 180.00, 180.00},{0.00, 180.00, 180.00},{0.00, 180.00, 180.00},{0.00, 180.00, 180.00}}
hagalZones = {"019932", "922c70", "5fbaf4", "cef5cb"}
hagalButton = "f1a7d1"
hagalButtonSpots = {{-40.00, 2, -15},{-15.00, 2, -15},{15.00, 2, -15},{40.00, 2, -15}}
hagalCombatSpots = {{-40.00, 2, -16.75},{-15.00, 2, -16.75},{15.00, 2, -16.75},{40.00, 2, -16.75}}

--Red, Blue, Orange and Green
scoreTokens = {"b14880", "380664", "388017", "0867e7"}
scoreTrackSpots = {{12.05, 2, -8.15}, {12.04, 2, -6.83}}

swordMasterTokens = {"ed3490", "a78ad7", "7549d5", "fb1629"}
swordMasterStart = {{-45.38, 2, -21.71}, {-19.99, 2, -21.85}, {9.94, 2, -21.94}, {34.73, 2, -21.96}}
swordMasterSpots = {{6.12, 2, 12.28}, {6.12, 2, 11.42}, {7.13, 2, 11.42}, {7.13, 1.08, 12.28}}
swordMasterSpotsIX = {{2.68, 1.36, 11.71}, {2.70, 1.36, 10.62}, {3.55, 1.36, 10.61}, {3.55, 1.36, 11.71}}

combatTokens = {"85d1f1", "a371fc", "f99579", "fff6c4"}
combatTokenSpots = {{1.20, 2, -5.89}, {1.76, 2, -5.89}, {2.32, 2, -5.89}, {2.88, 2, -5.89}}

freighterTokens = {"baab6a", "a79dae", "b4843b", "2c5541"}
freighterStartPosition = {{8.55, 1.4, 10.70}, {9.25, 1.4, 10.70}, {9.95, 1.4, 10.70}, {10.65, 1.4, 10.70}}

expansionIX = "6b4579"
imperiumRules = "d80d1f"
riseRules = "dffad3"

snooperTokens = {"48697e", "f81ccf", "4b913e", "e1d7b4"}
snooperPosition = {{-12.09, 1.3, 11.20}, {-12.09, 1.3, 5.10}, {-12.09, 1.3, -1.05}, {-12.10, 1.3, -7.05}}
snooperRotation = {{0.00, 179.97, 353.67}, {0.00, 179.97, 353.73}, {0.00, 179.97, 353.72}, {0.00, 179.98, 353.77}}

supplyZones = {"58f873", "58f84d", "e7685b", "1cb2a6"}
garrisonSpots = {["Red"] = {{1.73, 2, -0.99}, {2.31, 2, -1.31}, {2.64, 2, -0.68}, {1.83, 2, -1.70}, {2.08, 2, -0.28}}, ["Blue"] = {{2.07, 2, -3.50}, {2.79, 2, -3.77}, {2.30, 2, -4.32}, {1.46, 2, -4.06}, {1.82, 2, -4.61}}, ["Orange"] = {{9.71, 2, -3.46}, {9.34, 2, -4.15}, {9.92, 2, -4.36}, {8.92, 2, -3.63}, {9.17, 2, -4.78}}, ["Green"] = {{9.32, 2, -0.67}, {10.03, 2, -0.71}, {9.89, 2, -1.42}, {9.87, 2, -0.12}, {8.77, 2, -1.31}}}
influenceSpots = {["Red"] = {{-10.91, 2, -8.62}, {-10.91, 2, -2.54}, {-10.91, 2, 3.61}, {-10.91, 2, 9.78}
}, ["Blue"] = {{-10.43, 2, -8.62}, {-10.43, 2, -2.54}, {-10.43, 2, 3.61}, {-10.43, 2, 9.78}}, ["Orange"] = {{-9.95, 2, -8.62}, {-9.95, 2, -2.54}, {-9.96, 2, 3.61}, {-9.94, 2, 9.78}}, ["Green"] = {{-9.44, 2, -8.62}, {-9.44, 2, -2.54}, {-9.44, 2, 3.61}, {-9.44, 2, 9.78}}}

starterDeckZones = {"97ba78", "6a6014", "4a4d87", "2570f5"}
councilorTokens = {"f19a48", "f5b14a", "5dd080", "a0028d"}

revealButtons = {"e1c44b", "096653", "922131", "3f4f80"}

inProgress = 0

bowls = {"redBowls", "blueBowls", "orangeBowls", "greenBowls"}

redBowls = {"85ebad", "ff8960", "8655b7", "10b4be"}
blueBowls = {"235331", "985873", "9a6fc5", "c494c8"}
orangeBowls = {"04d59b", "8b211a", "1d6251", "fe3513"}
greenBowls = {"917162", "2a5d7c", "6fae7e", "1bf397"}

harkonnenTokens = {"690202", "cd9759", "88e4de", "dadf18"}
hiddenPlayerZones = {"6e6944", "b1eaa5", "73df06", "dda0f6"}
offsetHidden = {-1.9, -0.65, 0.65, 1.9}

leaderZones = {"019932", "922c70", "5fbaf4", "cef5cb"}
leaderGUID = {"717776", "1a4dcc", "ceee90", "d9daed", "2df658", "5a8a9a", "4d862a", "98cae8", "9b6cdc", "78551e", "4cf050", "06b6eb", "1244ec", "952a13"}

--Immortality Token References
ResearchTokens = {"620e3e", "95be90", "4a1180", "6c8158"}
TleilaxuTokens = {"ae6966", "6806fc", "309e08", "914211"}

function updateFremenInfluence(position)
  influenceFremen[position[1][1]] = 1
end

function updateBeneInfluence(position)
  influenceFremen[position[1][1]] = 1
end

function updateGuildInfluence(position)
  influenceFremen[position[1][1]] = 1
end

function updateEmperorInfluence(position)
  influenceFremen[position[1][1]] = 1
end

function clearLeaderLabels()
  for _, lead in ipairs(leaderGUID) do
    if getObjectFromGUID(lead) then
      getObjectFromGUID(lead).clearButtons()
    end
  end
end

function resetSave()
  inProgress = 0
  rivals = {0,0,0,0}
  playSeat = {0,0,0,0}
  influenceFremen = {0,0,0,0}
  influenceBene = {0,0,0,0}
  influenceGuild = {0,0,0,0}
  influenceEmperor = {0,0,0,0}
end

function onObjectDrop(colorName, obj)
    if obj.tag == "Block" then

    local playerPingCount = 0
    local playerCheck = Player.getPlayers()

    for _, playerPing in ipairs(playerCheck) do
      if playerPing.color == "Red" or playerPing.color == "Blue" or playerPing.color == "Orange" or playerPing.color == "Green" then
        playerPingCount = playerPingCount + 1
      end
    end

    if playerPingCount == 2 then
      if rivals[1] == 1 then
        rivalColor = "Red"
      elseif rivals[2] == 1 then
        rivalColor = "Blue"
      elseif rivals[3] == 1 then
        rivalColor = "Orange"
      elseif rivals[4] == 1 then
        rivalColor = "Green"
      end
    end

      Wait.frames(function()
        local blockPos = obj.getPosition()
        if (round(blockPos.x,2) >= -10.91) and (round(blockPos.x,2) <= -9.44) and (round(blockPos.z,2) <= -7.72) and (round(blockPos.z,2) >= -8.62) and influenceFremen[colorRef[obj.getName()]] == 1 then
          influenceFremen[colorRef[obj.getName()]] = 0
          local vpCall = ("down" .. obj.getName())
          if playerPingCount != 2 then
            getObjectFromGUID("2da390").call(vpCall,{})
          elseif playerPingCount == 2 then
            if obj.getName() != rivalColor then
              getObjectFromGUID("2da390").call(vpCall,{})
            end
          end
        elseif (round(blockPos.x,2) >= -10.91) and (round(blockPos.x,2) <= -9.44) and (round(blockPos.z,2) >= -6.82) and (round(blockPos.z,2) <= -3.62) and influenceFremen[colorRef[obj.getName()]] == 0 then
          influenceFremen[colorRef[obj.getName()]] = 1
          local vpCall = ("up" .. obj.getName())
          if playerPingCount != 2 then
            getObjectFromGUID("2da390").call(vpCall,{})
          elseif playerPingCount == 2 then
            if obj.getName() != rivalColor then
              getObjectFromGUID("2da390").call(vpCall,{})
            end
          end
        elseif (round(blockPos.x,2) >= -10.91) and (round(blockPos.x,2) <= -9.44) and (round(blockPos.z,2) <= -1.64) and (round(blockPos.z,2) >= -2.54) and influenceBene[colorRef[obj.getName()]] == 1 then
          influenceBene[colorRef[obj.getName()]] = 0
          local vpCall = ("down" .. obj.getName())
          if playerPingCount != 2 then
            getObjectFromGUID("2da390").call(vpCall,{})
          elseif playerPingCount == 2 then
            if obj.getName() != rivalColor then
              getObjectFromGUID("2da390").call(vpCall,{})
            end
          end
        elseif (round(blockPos.x,2) >= -10.91) and (round(blockPos.x,2) <= -9.44) and (round(blockPos.z,2) >= -0.74) and (round(blockPos.z,2) <= 2.53) and influenceBene[colorRef[obj.getName()]] == 0 then
          influenceBene[colorRef[obj.getName()]] = 1
          local vpCall = ("up" .. obj.getName())
          if playerPingCount != 2 then
            getObjectFromGUID("2da390").call(vpCall,{})
          elseif playerPingCount == 2 then
            if obj.getName() != rivalColor then
              getObjectFromGUID("2da390").call(vpCall,{})
            end
          end
        elseif (round(blockPos.x,2) >= -10.91) and (round(blockPos.x,2) <= -9.44) and (round(blockPos.z,2) <= 4.51) and (round(blockPos.z,2) >= 3.61) and influenceGuild[colorRef[obj.getName()]] == 1 then
          influenceGuild[colorRef[obj.getName()]] = 0
          local vpCall = ("down" .. obj.getName())
          if playerPingCount != 2 then
            getObjectFromGUID("2da390").call(vpCall,{})
          elseif playerPingCount == 2 then
            if obj.getName() != rivalColor then
              getObjectFromGUID("2da390").call(vpCall,{})
            end
          end
        elseif (round(blockPos.x,2) >= -10.91) and (round(blockPos.x,2) <= -9.44) and (round(blockPos.z,2) >= 5.41) and (round(blockPos.z,2) <= 8.64) and influenceGuild[colorRef[obj.getName()]] == 0 then
          influenceGuild[colorRef[obj.getName()]] = 1
          local vpCall = ("up" .. obj.getName())
          if playerPingCount != 2 then
            getObjectFromGUID("2da390").call(vpCall,{})
          elseif playerPingCount == 2 then
            if obj.getName() != rivalColor then
              getObjectFromGUID("2da390").call(vpCall,{})
            end
          end
        elseif (round(blockPos.x,2) >= -10.91) and (round(blockPos.x,2) <= -9.44) and (round(blockPos.z,2) <= 10.68) and (round(blockPos.z,2) >= 9.77) and influenceEmperor[colorRef[obj.getName()]] == 1 then
          influenceEmperor[colorRef[obj.getName()]] = 0
          local vpCall = ("down" .. obj.getName())
          if playerPingCount != 2 then
            getObjectFromGUID("2da390").call(vpCall,{})
          elseif playerPingCount == 2 then
            if obj.getName() != rivalColor then
              getObjectFromGUID("2da390").call(vpCall,{})
            end
          end
        elseif (round(blockPos.x,2) >= -10.91) and (round(blockPos.x,2) <= -9.44) and (round(blockPos.z,2) >= 11.58) and (round(blockPos.z,2) <= 14.80) and influenceEmperor[colorRef[obj.getName()]] == 0 then
          influenceEmperor[colorRef[obj.getName()]] = 1
          local vpCall = ("up" .. obj.getName())
          if playerPingCount != 2 then
            getObjectFromGUID("2da390").call(vpCall,{})
          elseif playerPingCount == 2 then
            if obj.getName() != rivalColor then
              getObjectFromGUID("2da390").call(vpCall,{})
            end
          end
        end
        if (round(blockPos.x,2) >= -10.91) and (round(blockPos.x,2) <= -9.44) and (round(blockPos.z,2) >= -5.02) and (round(blockPos.z,2) <= -3.62) then
          local params = {obj}
          getObjectFromGUID("4c2bcc").call("allianceCheck",{params})
        end
        if (round(blockPos.x,2) >= -10.91) and (round(blockPos.x,2) <= -9.44) and (round(blockPos.z,2) >= 1.06) and (round(blockPos.z,2) <= 2.53) then
          local params = {obj}
          getObjectFromGUID("33452e").call("allianceCheck",{params})
        end
        if (round(blockPos.x,2) >= -10.91) and (round(blockPos.x,2) <= -9.44) and (round(blockPos.z,2) >= 7.21) and (round(blockPos.z,2) <= 9.01) then
          local params = {obj}
          getObjectFromGUID("ad1aae").call("allianceCheck",{params})
        end
        if (round(blockPos.x,2) >= -10.91) and (round(blockPos.x,2) <= -9.44) and (round(blockPos.z,2) >= 13.38) and (round(blockPos.z,2) <= 15.18) then
          local params = {obj}
          getObjectFromGUID("13e990").call("allianceCheck",{params})
        end
      end, 30)
    end

    if obj.getDescription() == "Agent" then
      local agentPos = obj.getPosition()

      local playerC = ""
      local mentatColor = ""

      if obj.getName() == "Mentat" then
        mentatColor = getObjectFromGUID("e7e9b1").getVar("playerColor")
      end
      if mentatColor == "Red" or obj.getName() == "Red Agent" or obj.getName() == "Red Swordmaster" then
        playerC = "Red"
      elseif mentatColor == "Blue" or obj.getName() == "Blue Agent" or obj.getName() == "Blue Swordmaster" then
        playerC = "Blue"
      elseif mentatColor == "Orange" or obj.getName() == "Orange Agent" or obj.getName() == "Orange Swordmaster" then
        playerC = "Orange"
      elseif mentatColor == "Green" or obj.getName() == "Green Agent" or obj.getName() == "Green Swordmaster" then
        playerC = "Green"
      end

      if round(agentPos.x,2) >= -8.63 and round(agentPos.x,2) <= -6.81 and round(agentPos.z,2) >= -8.56 and round(agentPos.z,2) <= -7.15 then
        local cubeQuery = getObjectFromGUID(influenceZones[1]).getObjects()
        local voiceCheck = 0
        local voiceQuery = getObjectFromGUID("24973a").getObjects()
        for _, itemQ in ipairs(voiceQuery) do
          if itemQ.getName() == "Voice Token" then
            voiceCheck = 1
          end
        end
        if voiceCheck == 0 then
         for _, item in ipairs(cubeQuery) do
          if item.tag == "Block" and item.getName() == playerC then
            local pos = item.getPosition()
            pos.y = 1.5
            pos.z = pos.z + 0.9

            if round(pos.z,2) == -3.22 or round(pos.z,2) == -3.39 then
              pos.z = -3.62
            elseif round(pos.z,2) == -4.12 then
              pos.z = -4.29
            end

            item.setPositionSmooth(pos,false,true)
            if round(pos.z,2) == -6.82 then
              local vpCall = ("up" .. playerC)
              getObjectFromGUID("2da390").call(vpCall,{})
              influenceFremen[colorRef[playerC]] = 1
            end
            if (round(pos.x,2) >= -10.91) and (round(pos.x,2) <= -9.44) and (round(pos.z,2) >= -5.02) and (round(pos.z,2) <= -3.62) then
              local params = {item}
              getObjectFromGUID("4c2bcc").call("allianceCheck",{params})
            end
          end
         end
        end
      elseif round(agentPos.x,2) >= -8.63 and round(agentPos.x,2) <= -6.81 and round(agentPos.z,2) >= -6.00 and round(agentPos.z,2) <= -4.60 then
        local cubeQuery = getObjectFromGUID(influenceZones[1]).getObjects()
        local voiceCheck = 0
        local voiceQuery = getObjectFromGUID("2ec4da").getObjects()
        for _, itemQ in ipairs(voiceQuery) do
          if itemQ.getName() == "Voice Token" then
            voiceCheck = 1
          end
        end
        if voiceCheck == 0 then
        for _, item in ipairs(cubeQuery) do
         if item.tag == "Block" and item.getName() == playerC then
            local pos = item.getPosition()
            pos.y = 1.5
            pos.z = pos.z + 0.9

            if round(pos.z,2) == -3.22 or round(pos.z,2) == -3.39 then
              pos.z = -3.62
            elseif round(pos.z,2) == -4.12 then
              pos.z = -4.29
            end

            item.setPositionSmooth(pos,false,true)
            if round(pos.z,2) == -6.82 then
              local vpCall = ("up" .. playerC)
              getObjectFromGUID("2da390").call(vpCall,{})
              influenceFremen[colorRef[playerC]] = 1
            end
            if (round(pos.x,2) >= -10.91) and (round(pos.x,2) <= -9.44) and (round(pos.z,2) >= -5.02) and (round(pos.z,2) <= -3.62) then
              local params = {item}
              getObjectFromGUID("4c2bcc").call("allianceCheck",{params})
            end
          end
         end
        end
      elseif round(agentPos.x,2) >= -8.63 and round(agentPos.x,2) <= -6.81 and round(agentPos.z,2) >= -2.30 and round(agentPos.z,2) <= -1.00 then
        local cubeQuery = getObjectFromGUID(influenceZones[2]).getObjects()
        local voiceCheck = 0
        local voiceQuery = getObjectFromGUID("545477").getObjects()
        for _, itemQ in ipairs(voiceQuery) do
          if itemQ.getName() == "Voice Token" then
            voiceCheck = 1
          end
        end
        if voiceCheck == 0 then
        for _, item in ipairs(cubeQuery) do
         if item.tag == "Block" and item.getName() == playerC then
            local pos = item.getPosition()
            pos.y = 1.5
            pos.z = pos.z + 0.9

            if round(pos.z,2) == 2.86 or round(pos.z,2) == 2.70 then
              pos.z = 2.53
            elseif round(pos.z,2) == 1.96 then
              pos.z = 1.80
            end

            item.setPositionSmooth(pos,false,true)
            if round(pos.z,2) == -0.74 then
              local vpCall = ("up" .. playerC)
              getObjectFromGUID("2da390").call(vpCall,{})
              influenceBene[colorRef[playerC]] = 1
            end
            if (round(pos.x,2) >= -10.91) and (round(pos.x,2) <= -9.44) and (round(pos.z,2) >= 1.06) and (round(pos.z,2) <= 2.53) then
              local params = {item}
              getObjectFromGUID("33452e").call("allianceCheck",{params})
            end
          end
         end
        end
      elseif round(agentPos.x,2) >= -8.63 and round(agentPos.x,2) <= -6.81 and round(agentPos.z,2) >= 0.15 and round(agentPos.z,2) <= 1.55 then
        local cubeQuery = getObjectFromGUID(influenceZones[2]).getObjects()
        local voiceCheck = 0
        local voiceQuery = getObjectFromGUID("90c61c").getObjects()
        for _, itemQ in ipairs(voiceQuery) do
          if itemQ.getName() == "Voice Token" then
            voiceCheck = 1
          end
        end
        if voiceCheck == 0 then
        for _, item in ipairs(cubeQuery) do
         if item.tag == "Block" and item.getName() == playerC then
            local pos = item.getPosition()
            pos.y = 1.5
            pos.z = pos.z + 0.9

            if round(pos.z,2) == 2.86 or round(pos.z,2) == 2.70 then
              pos.z = 2.53
            elseif round(pos.z,2) == 1.96 then
              pos.z = 1.80
            end

            item.setPositionSmooth(pos,false,true)
            if round(pos.z,2) == -0.74 then
              local vpCall = ("up" .. playerC)
              getObjectFromGUID("2da390").call(vpCall,{})
              influenceBene[colorRef[playerC]] = 1
            end
            if (round(pos.x,2) >= -10.91) and (round(pos.x,2) <= -9.44) and (round(pos.z,2) >= 1.06) and (round(pos.z,2) <= 2.53) then
              local params = {item}
              getObjectFromGUID("33452e").call("allianceCheck",{params})
            end
          end
         end
        end
      elseif round(agentPos.x,2) >= -8.63 and round(agentPos.x,2) <= -6.81 and round(agentPos.z,2) >= 3.80 and round(agentPos.z,2) <= 5.15 then
        local cubeQuery = getObjectFromGUID(influenceZones[3]).getObjects()
        local voiceCheck = 0
        local voiceQuery = getObjectFromGUID("57c221").getObjects()
        for _, itemQ in ipairs(voiceQuery) do
          if itemQ.getName() == "Voice Token" then
            voiceCheck = 1
          end
        end
        if voiceCheck == 0 then
        for _, item in ipairs(cubeQuery) do
         if item.tag == "Block" and item.getName() == playerC then
            local pos = item.getPosition()
            pos.y = 1.5
            pos.z = pos.z + 0.9

            if round(pos.z,2) == 8.83 or round(pos.z,2) == 9.01 then
              pos.z = 8.64
            elseif round(pos.z,2) == 8.11 then
              pos.z = 7.93
            end

            item.setPositionSmooth(pos,false,true)
            if round(pos.z,2) == 5.41 then
              local vpCall = ("up" .. playerC)
              getObjectFromGUID("2da390").call(vpCall,{})
              influenceGuild[colorRef[playerC]] = 1
            end
            if (round(pos.x,2) >= -10.91) and (round(pos.x,2) <= -9.44) and (round(pos.z,2) >= 7.21) and (round(pos.z,2) <= 8.64) then
              local params = {item}
              getObjectFromGUID("ad1aae").call("allianceCheck",{params})
            end
          end
         end
        end
      elseif round(agentPos.x,2) >= -8.63 and round(agentPos.x,2) <= -6.81 and round(agentPos.z,2) >= 6.25 and round(agentPos.z,2) <= 7.60 then
        local cubeQuery = getObjectFromGUID(influenceZones[3]).getObjects()
        local voiceCheck = 0
        local voiceQuery = getObjectFromGUID("c879a0").getObjects()
        for _, itemQ in ipairs(voiceQuery) do
          if itemQ.getName() == "Voice Token" then
            voiceCheck = 1
          end
        end
        if voiceCheck == 0 then
        for _, item in ipairs(cubeQuery) do
         if item.tag == "Block" and item.getName() == playerC then
            local pos = item.getPosition()
            pos.y = 1.5
            pos.z = pos.z + 0.9

            if round(pos.z,2) == 8.83 or round(pos.z,2) == 9.01 then
              pos.z = 8.64
            elseif round(pos.z,2) == 8.11 then
              pos.z = 7.93
            end

            item.setPositionSmooth(pos,false,true)
            if round(pos.z,2) == 5.41 then
              local vpCall = ("up" .. playerC)
              getObjectFromGUID("2da390").call(vpCall,{})
              influenceGuild[colorRef[playerC]] = 1
            end
            if (round(pos.x,2) >= -10.91) and (round(pos.x,2) <= -9.44) and (round(pos.z,2) >= 7.21) and (round(pos.z,2) <= 8.64) then
              local params = {item}
              getObjectFromGUID("ad1aae").call("allianceCheck",{params})
            end
          end
         end
        end
      elseif round(agentPos.x,2) >= -8.63 and round(agentPos.x,2) <= -6.81 and round(agentPos.z,2) >= 9.90 and round(agentPos.z,2) <= 11.30 then
        local cubeQuery = getObjectFromGUID(influenceZones[4]).getObjects()
        local voiceCheck = 0
        local voiceQuery = getObjectFromGUID("de7762").getObjects()
        for _, itemQ in ipairs(voiceQuery) do
          if itemQ.getName() == "Voice Token" then
            voiceCheck = 1
          end
        end
        if voiceCheck == 0 then
        for _, item in ipairs(cubeQuery) do
         if item.tag == "Block" and item.getName() == playerC then
            local pos = item.getPosition()
            pos.y = 1.5
            pos.z = pos.z + 0.9

            if round(pos.z,2) == 15.02 or round(pos.z,2) == 15.18 then
              pos.z = 14.80
            elseif round(pos.z,2) == 14.28 then
              pos.z = 14.12
            end

            item.setPositionSmooth(pos,false,true)
            if round(pos.z,2) == 11.58 then
              local vpCall = ("up" .. playerC)
              getObjectFromGUID("2da390").call(vpCall,{})
              influenceEmperor[colorRef[playerC]] = 1
            end
            if (round(pos.x,2) >= -10.91) and (round(pos.x,2) <= -9.44) and (round(pos.z,2) >= 13.38) and (round(pos.z,2) <= 14.80) then
              local params = {item}
              getObjectFromGUID("13e990").call("allianceCheck",{params})
            end
          end
         end
        end
      elseif round(agentPos.x,2) >= -8.63 and round(agentPos.x,2) <= -6.81 and round(agentPos.z,2) >= 12.40 and round(agentPos.z,2) <= 13.80 then
        local cubeQuery = getObjectFromGUID(influenceZones[4]).getObjects()
        local voiceCheck = 0
        local voiceQuery = getObjectFromGUID("d526ea").getObjects()
        for _, itemQ in ipairs(voiceQuery) do
          if itemQ.getName() == "Voice Token" then
            voiceCheck = 1
          end
        end
        if voiceCheck == 0 then
        for _, item in ipairs(cubeQuery) do
         if item.tag == "Block" and item.getName() == playerC then
            local pos = item.getPosition()
            pos.y = 1.5
            pos.z = pos.z + 0.9

            if round(pos.z,2) == 15.02 or round(pos.z,2) == 15.18 then
              pos.z = 14.80
            elseif round(pos.z,2) == 14.28 then
              pos.z = 14.12
            end

            item.setPositionSmooth(pos,false,true)
            if round(pos.z,2) == 11.58 then
              local vpCall = ("up" .. playerC)
              getObjectFromGUID("2da390").call(vpCall,{})
              influenceEmperor[colorRef[playerC]] = 1
            end
            if (round(pos.x,2) >= -10.91) and (round(pos.x,2) <= -9.44) and (round(pos.z,2) >= 13.38) and (round(pos.z,2) <= 14.80) then
              local params = {item}
              getObjectFromGUID("13e990").call("allianceCheck",{params})
            end
          end
         end
        end
      elseif round(agentPos.x,2) >= -3.98 and round(agentPos.x,2) <= -2.20 and round(agentPos.z,2) >= 13.40 and round(agentPos.z,2) <= 14.75 then
        local agentRef = 0
        local mentatColor = ""
        local voiceCheck = 0
        local voiceQuery = getObjectFromGUID("913070").getObjects()
        for _, itemQ in ipairs(voiceQuery) do
          if itemQ.getName() == "Voice Token" then
            voiceCheck = 1
          end
        end
        if voiceCheck == 0 then
        if obj.getName() == "Mentat" then
          mentatColor = getObjectFromGUID("e7e9b1").getVar("playerColor")
        end
        if mentatColor == "Red" or obj.getName() == "Red Agent" or obj.getName() == "Red Swordmaster" then
          agentRef = 1
        elseif mentatColor == "Blue" or obj.getName() == "Blue Agent" or obj.getName() == "Blue Swordmaster" then
          agentRef = 2
        elseif mentatColor == "Orange" or obj.getName() == "Orange Agent" or obj.getName() == "Orange Swordmaster" then
          agentRef = 3
        elseif mentatColor == "Green" or obj.getName() == "Green Agent" or obj.getName() == "Green Swordmaster" then
          agentRef = 4
        end

        bonusTokens = getObjectFromGUID("12120b").getObjects()

        local bonusToken = ""
        for _, bonusItem in ipairs(bonusTokens) do
          if bonusItem.getName() == "Councilor Bonus" then
            bonusToken = bonusItem
            break
          end
        end

        local placementCheck = getObjectFromGUID(councilorTokens[agentRef]).getPosition()
        if getObjectFromGUID(firstPlayerToken).getVar("riseIX") == 1 then
          local placementPos = 13.68
        else
          local placementPos = 14.08
        end

        if bonusToken != "" and round(placementCheck.z,2) != placementPos then
          local bonusPos = bonusToken.getPosition()
          bonusPos.y = 1.5
          getObjectFromGUID(councilorTokens[agentRef]).setPositionSmooth(bonusPos, false, true)
        end
        end
      end
    end
end

function round(num, dec)
  local mult = 10^(dec or 0)
  return math.floor(num * mult + 0.5) / mult
end

function onLoad(saved_data_global)
  if saved_data_global ~= "" and saved_data_global ~= nil then
    local loaded_data = JSON.decode(saved_data_global)

    inProgress = loaded_data[1]
    rivals = loaded_data[2]
    playSeat = loaded_data[3]
    influenceLevel = loaded_data[4]
    influenceFremen = loaded_data[5]
    influenceBene = loaded_data[6]
    influenceGuild = loaded_data[7]
    influenceEmperor = loaded_data[8]
    hagalSpot = loaded_data[9]
    swordMasterSpots = loaded_data[10]
    if influenceFremen == nil then
      influenceFremen = {0,0,0,0}
    end
    if influenceBene == nil then
      influenceBene = {0,0,0,0}
    end
    if influenceGuild == nil then
      influenceGuild = {0,0,0,0}
    end
    if influenceEmperor == nil then
      influenceEmperor = {0,0,0,0}
    end
    if swordMasterSpots == nil then
      swordMasterSpots = {{6.12, 2, 12.28}, {6.12, 2, 11.42}, {7.13, 1.08, 12.28}, {7.13, 2, 11.42}}
    end
  else

    inProgress = 0
    rivals = {0,0,0,0}
    playSeat = {0,0,0,0}
    influenceFremen = {0,0,0,0}
    influenceBene = {0,0,0,0}
    influenceGuild = {0,0,0,0}
    influenceEmperor = {0,0,0,0}
    hagalSpot = 0
    swordMasterSpots = {{6.12, 2, 12.28}, {6.12, 2, 11.42}, {7.13, 1.08, 12.28}, {7.13, 2, 11.42}}
  end
  if inProgress == 1 then

    Wait.frames(function() startGOM() end,20)

    getObjectFromGUID("400db5").call("bagLabel", {})
    getObjectFromGUID("5090e6").call("bagLabel", {})
    getObjectFromGUID("3f6168").call("bagLabel", {})
    getObjectFromGUID("85289a").call("bagLabel", {})
    getObjectFromGUID("3d38e5").call("bagLabel", {})

    getObjectFromGUID("2da390").call("changeScore",{})

    playerPingCount = 0
    playerCheck = Player.getPlayers()

    for _, playerPing in ipairs(playerCheck) do
      if playerPing.color == "Red" or playerPing.color == "Blue" or playerPing.color == "Orange" or playerPing.color == "Green" then
        playerPingCount = playerPingCount + 1
      end
    end

    if playSeat[1] == 1 or rivals[1] == 1 then
      getObjectFromGUID("a0fa97").call("boardSetup", {})
    end
    if playSeat[2] == 1 or rivals[2] == 1 then
      getObjectFromGUID("042887").call("boardSetup", {})
    end
    if playSeat[3] == 1 or rivals[3] == 1 then
      getObjectFromGUID("e435ab").call("boardSetup", {})
    end
    if playSeat[4] == 1 or rivals[4] == 1 then
      getObjectFromGUID("f8a49f").call("boardSetup", {})
    end

    for i=1,4 do
      if rivals[i] == 1 then
        getObjectFromGUID(rivalBoards[i]).call("rivalSetup", {})
        getObjectFromGUID(rivalBoards[i]).call("rivalButtons", {})
      end
    end

    Wait.frames(function()
      getObjectFromGUID("2da390").call("loadButtonState",{})
    end,60)

    for i=1, 5 do
      cardReset = GetDeckOrCard(imperiumRow[i])
      rowPos = cardReset.getPosition()
      rowPos.y = rowPos.y + 1
      cardReset.setPositionSmooth(rowPos,false,true)
    end

    getObjectFromGUID("7962b9").call("setupAcquire",{})

  end

end

function onSave()
  local ip = inProgress
  --local r = rivals
  local r = selectedRivalsSave
  local ps = playSeat
  local il = influenceLevel
  local inf = influenceFremen
  local inb = influenceBene
  local ing = influenceGuild
  local ine = influenceEmperor
  local hs = hagalSpot
  local sp = swordMasterSpots

  local data_to_save = {ip,r,ps,il,inf,inb,ing,ine,hs,sp}

  saved_data_global = JSON.encode(data_to_save)

  return saved_data_global
end

function onUpdate()
end

function sendConflictButtons()
  getObjectFromGUID("d46be8").setPositionSmooth({2.20, 1.5, -2.38},false,true)
  getObjectFromGUID("d46be8").setRotationSmooth({0.00, 180.00, 0.00})
  getObjectFromGUID("b2b733").setPositionSmooth({6.00, 1.5, -0.10},false,true)
  getObjectFromGUID("b2b733").setRotationSmooth({0.00, 180.00, 0.00})
  getObjectFromGUID("49293f").setPositionSmooth({9.66, 1.5, -2.42},false,true)
  getObjectFromGUID("49293f").setRotationSmooth({0.00, 180.00, 0.00})

  Wait.frames(function()
    getObjectFromGUID("d46be8").setLock(true)
    getObjectFromGUID("b2b733").setLock(true)
    getObjectFromGUID("49293f").setLock(true)
  end, 60)

end

function setupGameStart()
  playerPingCount = 0
  playerCheck = Player.getPlayers()

  for _, playerPing in ipairs(playerCheck) do
    if playerPing.color == "Red" or playerPing.color == "Blue" or playerPing.color == "Orange" or playerPing.color == "Green" then
      playerPingCount = playerPingCount + 1
    end
  end

  if playerPingCount > 0 then
    startLuaCoroutine(self, "setupGame")
  else
    broadcastToAll("No Players Seated!")
    getObjectFromGUID(firstPlayerToken).call("resetSetup", {})
  end
end

function setupGame()
  conflictOne = GetDeckOrCard(conflictZones[1])
  conflictTwo = GetDeckOrCard(conflictZones[2])
  conflictThree = GetDeckOrCard(conflictZones[3])
  imperiumDeck = GetDeckOrCard(imperiumDeckZone)
  intrigueDeck = GetDeckOrCard(intrigueDeckZone)
  researchDeck = GetDeckOrCard(researchDeckZone)

  conflictOne.shuffle()
  conflictTwo.shuffle()
  conflictThree.shuffle()
  imperiumDeck.shuffle()
  intrigueDeck.shuffle()

  if getObjectFromGUID(firstPlayerToken).getVar("riseIX") == 1 then
    swordMasterSpots = swordMasterSpotsIX
  end

  local Time = os.clock() + 0.4
    while os.clock() < Time do
      coroutine.yield(0)
    end

  conflictOne.shuffle()
  conflictTwo.shuffle()
  conflictThree.shuffle()
  imperiumDeck.shuffle()
  intrigueDeck.shuffle()

  for i=1,4 do
    if i < 4 then
      conflictThree.takeObject({position = conflictDeckLocation})
    else
      if getObjectFromGUID(firstPlayerToken).getVar("riseIX") == 1 then
        conflictThree.takeObject({position = conflictDeckLocation})
      else
        conflictThree = GetDeckOrCard(conflictZones[3])
        conflictThree.setPositionSmooth(conflictDeckLocation)
      end
    end

    local Time = os.clock() + 0.25
      while os.clock() < Time do
        coroutine.yield(0)
      end
  end
  if getObjectFromGUID(firstPlayerToken).getVar("epicMode") == 1 then
    conflictThree = GetDeckOrCard(conflictZones[3])
    conflictThree.setPositionSmooth(conflictDeckLocation)
  end

  local Time = os.clock() + 0.25
    while os.clock() < Time do
      coroutine.yield(0)
    end

  if getObjectFromGUID(firstPlayerToken).getVar("riseIX") == 1 and getObjectFromGUID(firstPlayerToken).getVar("epicMode") == 0 then
    conflictThree = GetDeckOrCard(conflictZones[3])
    getObjectFromGUID(trashBin).putObject(conflictThree)
  end

  for i=1, 5 do
    conflictTwo.takeObject({position = conflictDeckLocation})

    local Time = os.clock() + 0.25
      while os.clock() < Time do
        coroutine.yield(0)
      end
  end

  local Time = os.clock() + 0.25
    while os.clock() < Time do
      coroutine.yield(0)
    end

  getObjectFromGUID(trashBin).putObject(conflictTwo)

  if getObjectFromGUID(firstPlayerToken).getVar("epicMode") == 0 then
    conflictOne.takeObject({position = conflictDeckLocation})
  end

  local Time = os.clock() + 0.25
    while os.clock() < Time do
      coroutine.yield(0)
    end

  getObjectFromGUID(trashBin).putObject(conflictOne)

  local Time = os.clock() + 0.25
    while os.clock() < Time do
      coroutine.yield(0)
    end

  for i=1, 5 do
    rowPos = getObjectFromGUID(imperiumRow[i]).getPosition()
    --rowPos.y = rowPos.y + 1
    rowPos.y = 2
    imperiumDeck.takeObject({position = rowPos, flip = true})

    local Time = os.clock() + 0.25
      while os.clock() < Time do
        coroutine.yield(0)
      end
  end

  --Research Row Setup
  if getObjectFromGUID(firstPlayerToken).getVar("immortality") == 1 then 
    for j=1, 2 do
      rowPos = getObjectFromGUID(researchRow[j]).getPosition()
      rowPos.y = 12.75
      researchDeck.takeObject({position = rowPos, flip = true})

      local Time = os.clock() + 0.25
        while os.clock() < Time do
          coroutine.yield(0)
        end
    end
  end

  --Reserve Board Setup
  getObjectFromGUID("7962b9").call("setupAcquire",{})

  playerCount = 0
  scoreTokenSetup = 0
  playerList = Player.getPlayers()

  for _, playerRef in ipairs(playerList) do
    playerCount = playerCount + 1
  end

  if playerCount == 0 then
    broadcastToAll("No Players are Seated!")
  elseif playerCount < 4 then
   scoreTokenSetup = 1
  elseif playerCount == 4 then
   scoreTokenSetup = 2
   if getObjectFromGUID(firstPlayerToken).getVar("elevenMode") == 1 then
     scoreTokenSetup = 1
   end
  end

  if Player["Red"].seated then
    local starterDeck = GetDeckOrCard(starterDeckZones[1])
    starterDeck.shuffle()
    getObjectFromGUID(scoreTokens[1]).setPositionSmooth(scoreTrackSpots[scoreTokenSetup],false,true)
    getObjectFromGUID(scoreTokens[1]).setRotationSmooth({0,180,0})
    getObjectFromGUID(swordMasterTokens[1]).setPositionSmooth(swordMasterSpots[1],false,true)
    getObjectFromGUID(swordMasterTokens[1]).setRotationSmooth({0,180,0})
    getObjectFromGUID(combatTokens[1]).setPositionSmooth(combatTokenSpots[1],false, true)
    getObjectFromGUID(combatTokens[1]).setRotationSmooth({0,180,0})
    getObjectFromGUID(councilorTokens[1]).setPositionSmooth(swordMasterStart[1],false,true)
    getObjectFromGUID(revealButtons[1]).setPositionSmooth({-40,1.75,-26},false,true)
    if getObjectFromGUID(firstPlayerToken).getVar("riseIX") == 1 then
      getObjectFromGUID(freighterTokens[1]).setPositionSmooth(freighterStartPosition[1], false, true)
    end
    if getObjectFromGUID(firstPlayerToken).getVar("epicMode") == 1 then
      local viscountCheck = 0
      local leaderQuery = getObjectFromGUID(leaderZones[1]).getObjects()
      for _, leaderObj in ipairs(leaderQuery) do
        if leaderObj.getName() == "Viscount Hundro Moritani" then
          viscountCheck = 1
        end
      end

      if viscountCheck == 0 then
        params = {"Red"}
        getObjectFromGUID("7962b9").call("intrigueBoardDraw",{params})
      elseif viscountCheck == 1 then
        Wait.frames(function()
          broadcastToAll("Viscount Hundro Moritani waits patiently...")
        end, 90)
      end

      if getObjectFromGUID(firstPlayerToken).getVar("immortality") != 1 then      
        for _, cardRemove in ipairs(starterDeck.getObjects()) do
          if cardRemove.description == "Desert Planet" then
            local cardPull = starterDeck.takeObject({guid = cardRemove.guid})
            cardPull.setPositionSmooth({14.50, 3.5, 17.80})
            break
          end
        end

        for _, cardAdd in ipairs(getObjectFromGUID(expansionIX).getObjects()) do
          if cardAdd.description == "Control the Spice" then
            local cardPull = getObjectFromGUID(expansionIX).takeObject({guid = cardAdd.guid})
            local deckPos = starterDeck.getPosition()
            deckPos.y = 2
            cardPull.setPositionSmooth(deckPos)
            cardPull.setRotationSmooth({0.00, 180.00, 180.00})
            break
          end
        end
      else
        for _, cardAdd in ipairs(getObjectFromGUID(expansionIX).getObjects()) do
          if cardAdd.description == "Control the Spice" then
            local cardPull = getObjectFromGUID(expansionIX).takeObject({guid = cardAdd.guid})
            cardPull.setPositionSmooth({-35.39, 2, -12.89})
            cardPull.setRotationSmooth({0.00, 180.00, 0.00})
            break
          end
        end
      end
    end
    Wait.frames(function()
      getObjectFromGUID(revealButtons[1]).setLock(true)
    end,60)
    local items = getObjectFromGUID(supplyZones[1]).getObjects()
    local influenceCount = 0
    local garrisonCount = 0
    for _, item in ipairs(items) do
      if item.tag == "Block" and influenceCount < 4 then
        influenceCount = influenceCount + 1
        item.setPositionSmooth(Vector(influenceSpots["Red"][influenceCount]),false,true)
        item.setRotationSmooth({0,180,0})
      elseif item.tag == "Block" and garrisonCount < (3 + (2 * getObjectFromGUID(firstPlayerToken).getVar("epicMode"))) then
        garrisonCount = garrisonCount + 1
        item.setPositionSmooth(Vector(garrisonSpots["Red"][garrisonCount]),false,true)
        item.setRotationSmooth({0,180,0})
      end
    end

    if getObjectFromGUID(firstPlayerToken).getVar("epicMode") == 1 then
       Wait.frames(function()
         starterDeck.deal(5, "Red")
       end,120)
    else
       starterDeck.deal(5, "Red")
    end

    getObjectFromGUID("a0fa97").call("boardSetup", {})
    playSeat[1] = 1

  end

  local Time = os.clock() + 0.5
    while os.clock() < Time do
      coroutine.yield(0)
    end

  if Player["Blue"].seated then
    local starterDeck = GetDeckOrCard(starterDeckZones[2])
    starterDeck.shuffle()
    getObjectFromGUID(scoreTokens[2]).setPositionSmooth(scoreTrackSpots[scoreTokenSetup])
    getObjectFromGUID(scoreTokens[2]).setRotationSmooth({0,180,0})
    getObjectFromGUID(swordMasterTokens[2]).setPositionSmooth(swordMasterSpots[2],false,true)
    getObjectFromGUID(swordMasterTokens[2]).setRotationSmooth({0,180,0})
    getObjectFromGUID(combatTokens[2]).setPositionSmooth(combatTokenSpots[2],false, true)
    getObjectFromGUID(combatTokens[2]).setRotationSmooth({0,180,0})
    getObjectFromGUID(councilorTokens[2]).setPositionSmooth(swordMasterStart[2],false,true)
    getObjectFromGUID(revealButtons[2]).setPositionSmooth({-15,1.75,-26},false,true)
    if getObjectFromGUID(firstPlayerToken).getVar("riseIX") == 1 then
      getObjectFromGUID(freighterTokens[2]).setPositionSmooth(freighterStartPosition[2], false, true)
    end
    if getObjectFromGUID(firstPlayerToken).getVar("epicMode") == 1 then
      local viscountCheck = 0
      local leaderQuery = getObjectFromGUID(leaderZones[2]).getObjects()
      for _, leaderObj in ipairs(leaderQuery) do
        if leaderObj.getName() == "Viscount Hundro Moritani" then
          viscountCheck = 1
        end
      end

      if viscountCheck == 0 then
        params = {"Blue"}
        getObjectFromGUID("7962b9").call("intrigueBoardDraw",{params})
      elseif viscountCheck == 1 then
        Wait.frames(function()
          broadcastToAll("Viscount Hundro Moritani waits patiently...")
        end, 90)
      end

      if getObjectFromGUID(firstPlayerToken).getVar("immortality") != 1 then      
        for _, cardRemove in ipairs(starterDeck.getObjects()) do
          if cardRemove.description == "Desert Planet" then
            local cardPull = starterDeck.takeObject({guid = cardRemove.guid})
            cardPull.setPositionSmooth({14.50, 3.5, 17.80})
            break
          end
        end

        for _, cardAdd in ipairs(getObjectFromGUID(expansionIX).getObjects()) do
          if cardAdd.description == "Control the Spice" then
            local cardPull = getObjectFromGUID(expansionIX).takeObject({guid = cardAdd.guid})
            local deckPos = starterDeck.getPosition()
            deckPos.y = 2
            cardPull.setPositionSmooth(deckPos)
            cardPull.setRotationSmooth({0.00, 180.00, 180.00})
            break
          end
        end
      else
        for _, cardAdd in ipairs(getObjectFromGUID(expansionIX).getObjects()) do
          if cardAdd.description == "Control the Spice" then
            local cardPull = getObjectFromGUID(expansionIX).takeObject({guid = cardAdd.guid})
            cardPull.setPositionSmooth({-10.39, 2, -12.89})
            cardPull.setRotationSmooth({0.00, 180.00, 0.00})
            break
          end
        end
      end
    end
    Wait.frames(function()
      getObjectFromGUID(revealButtons[2]).setLock(true)
    end,60)
    local items = getObjectFromGUID(supplyZones[2]).getObjects()
    local influenceCount = 0
    local garrisonCount = 0
    for _, item in ipairs(items) do
      if item.tag == "Block" and influenceCount < 4 then
        influenceCount = influenceCount + 1
        item.setPositionSmooth(Vector(influenceSpots["Blue"][influenceCount]),false,true)
        item.setRotationSmooth({0,180,0})
      elseif item.tag == "Block" and garrisonCount < (3 + (2 * getObjectFromGUID(firstPlayerToken).getVar("epicMode"))) then
        garrisonCount = garrisonCount + 1
        item.setPositionSmooth(Vector(garrisonSpots["Blue"][garrisonCount]),false,true)
        item.setRotationSmooth({0,180,0})
      end
    end

    if getObjectFromGUID(firstPlayerToken).getVar("epicMode") == 1 then
      Wait.frames(function()
        starterDeck.deal(5, "Blue")
      end,120)
    else
      starterDeck.deal(5, "Blue")
    end

    getObjectFromGUID("042887").call("boardSetup", {})
    playSeat[2] = 1

  end

  local Time = os.clock() + 0.5
    while os.clock() < Time do
      coroutine.yield(0)
    end

  if Player["Orange"].seated then
    local starterDeck = GetDeckOrCard(starterDeckZones[3])
    starterDeck.shuffle()
    getObjectFromGUID(scoreTokens[3]).setPositionSmooth(scoreTrackSpots[scoreTokenSetup])
    getObjectFromGUID(scoreTokens[3]).setRotationSmooth({0,180,0})
    getObjectFromGUID(swordMasterTokens[3]).setPositionSmooth(swordMasterSpots[3],false,true)
    getObjectFromGUID(swordMasterTokens[3]).setRotationSmooth({0,180,0})
    getObjectFromGUID(combatTokens[3]).setPositionSmooth(combatTokenSpots[3],false, true)
    getObjectFromGUID(combatTokens[3]).setRotationSmooth({0,180,0})
    getObjectFromGUID(councilorTokens[3]).setPositionSmooth(swordMasterStart[3],false,true)
    getObjectFromGUID(revealButtons[3]).setPositionSmooth({15,1.75,-26},false,true)
    if getObjectFromGUID(firstPlayerToken).getVar("riseIX") == 1 then
      getObjectFromGUID(freighterTokens[3]).setPositionSmooth(freighterStartPosition[3], false, true)
    end
    if getObjectFromGUID(firstPlayerToken).getVar("epicMode") == 1 then
      local viscountCheck = 0
      local leaderQuery = getObjectFromGUID(leaderZones[3]).getObjects()
      for _, leaderObj in ipairs(leaderQuery) do
        if leaderObj.getName() == "Viscount Hundro Moritani" then
          viscountCheck = 1
        end
      end

      if viscountCheck == 0 then
        params = {"Orange"}
        getObjectFromGUID("7962b9").call("intrigueBoardDraw",{params})
      elseif viscountCheck == 1 then
        Wait.frames(function()
          broadcastToAll("Viscount Hundro Moritani waits patiently...")
        end, 90)
      end

      if getObjectFromGUID(firstPlayerToken).getVar("immortality") != 1 then 
        for _, cardRemove in ipairs(starterDeck.getObjects()) do
          if cardRemove.description == "Desert Planet" then
            local cardPull = starterDeck.takeObject({guid = cardRemove.guid})
            cardPull.setPositionSmooth({14.50, 3.5, 17.80})
            break
          end
        end

        for _, cardAdd in ipairs(getObjectFromGUID(expansionIX).getObjects()) do
          if cardAdd.description == "Control the Spice" then
            local cardPull = getObjectFromGUID(expansionIX).takeObject({guid = cardAdd.guid})
            local deckPos = starterDeck.getPosition()
            deckPos.y = 2
            cardPull.setPositionSmooth(deckPos)
            cardPull.setRotationSmooth({0.00, 180.00, 180.00})
            break
          end
        end
      else
        for _, cardAdd in ipairs(getObjectFromGUID(expansionIX).getObjects()) do
          if cardAdd.description == "Control the Spice" then
            local cardPull = getObjectFromGUID(expansionIX).takeObject({guid = cardAdd.guid})
            cardPull.setPositionSmooth({19.61, 2, -12.89})
            cardPull.setRotationSmooth({0.00, 180.00, 0.00})
            break
          end
        end
      end
    end
    Wait.frames(function()
      getObjectFromGUID(revealButtons[3]).setLock(true)
    end,60)
    local items = getObjectFromGUID(supplyZones[3]).getObjects()
    local influenceCount = 0
    local garrisonCount = 0
    for _, item in ipairs(items) do
      if item.tag == "Block" and influenceCount < 4 then
        influenceCount = influenceCount + 1
        item.setPositionSmooth(Vector(influenceSpots["Orange"][influenceCount]),false,true)
        item.setRotationSmooth({0,180,0})
      elseif item.tag == "Block" and garrisonCount < (3 + (2 * getObjectFromGUID(firstPlayerToken).getVar("epicMode"))) then
        garrisonCount = garrisonCount + 1
        item.setPositionSmooth(Vector(garrisonSpots["Orange"][garrisonCount]),false,true)
        item.setRotationSmooth({0,180,0})
      end
    end
    if getObjectFromGUID(firstPlayerToken).getVar("epicMode") == 1 then
      Wait.frames(function()
        starterDeck.deal(5, "Orange")
      end,120)
    else
      starterDeck.deal(5, "Orange")
    end

    getObjectFromGUID("e435ab").call("boardSetup", {})
    playSeat[3] = 1

  end

  local Time = os.clock() + 0.5
    while os.clock() < Time do
      coroutine.yield(0)
    end

  if Player["Green"].seated then
    local starterDeck = GetDeckOrCard(starterDeckZones[4])
    starterDeck.shuffle()
    getObjectFromGUID(scoreTokens[4]).setPositionSmooth(scoreTrackSpots[scoreTokenSetup])
    getObjectFromGUID(scoreTokens[4]).setRotationSmooth({0,180,0})
    getObjectFromGUID(swordMasterTokens[4]).setPositionSmooth(swordMasterSpots[4],false,true)
    getObjectFromGUID(swordMasterTokens[4]).setRotationSmooth({0,180,0})
    getObjectFromGUID(combatTokens[4]).setPositionSmooth(combatTokenSpots[4],false, true)
    getObjectFromGUID(combatTokens[4]).setRotationSmooth({0,180,0})
    getObjectFromGUID(councilorTokens[4]).setPositionSmooth(swordMasterStart[4],false,true)
    getObjectFromGUID(revealButtons[4]).setPositionSmooth({40,1.75,-26},false,true)
    if getObjectFromGUID(firstPlayerToken).getVar("riseIX") == 1 then
      getObjectFromGUID(freighterTokens[4]).setPositionSmooth(freighterStartPosition[4], false, true)
    end
    if getObjectFromGUID(firstPlayerToken).getVar("epicMode") == 1 then
      local viscountCheck = 0
      local leaderQuery = getObjectFromGUID(leaderZones[4]).getObjects()
      for _, leaderObj in ipairs(leaderQuery) do
        if leaderObj.getName() == "Viscount Hundro Moritani" then
          viscountCheck = 1
        end
      end

      if viscountCheck == 0 then
        params = {"Green"}
        getObjectFromGUID("7962b9").call("intrigueBoardDraw",{params})
      elseif viscountCheck == 1 then
        Wait.frames(function()
          broadcastToAll("Viscount Hundro Moritani waits patiently...")
        end, 90)
      end

      if getObjectFromGUID(firstPlayerToken).getVar("immortality") != 1 then 
        for _, cardRemove in ipairs(starterDeck.getObjects()) do
          if cardRemove.description == "Desert Planet" then
            local cardPull = starterDeck.takeObject({guid = cardRemove.guid})
            cardPull.setPositionSmooth({14.50, 3.5, 17.80})
            break
          end
        end

        for _, cardAdd in ipairs(getObjectFromGUID(expansionIX).getObjects()) do
          if cardAdd.description == "Control the Spice" then
            local cardPull = getObjectFromGUID(expansionIX).takeObject({guid = cardAdd.guid})
            local deckPos = starterDeck.getPosition()
            deckPos.y = 2
            cardPull.setPositionSmooth(deckPos)
            cardPull.setRotationSmooth({0.00, 180.00, 180.00})
            break
          end
        end
      else
        for _, cardAdd in ipairs(getObjectFromGUID(expansionIX).getObjects()) do
          if cardAdd.description == "Control the Spice" then
            local cardPull = getObjectFromGUID(expansionIX).takeObject({guid = cardAdd.guid})
            cardPull.setPositionSmooth({44.61, 2, -12.89})
            cardPull.setRotationSmooth({0.00, 180.00, 0.00})
            break
          end
        end
      end
    end
    Wait.frames(function()
      getObjectFromGUID(revealButtons[4]).setLock(true)
    end,60)
    local items = getObjectFromGUID(supplyZones[4]).getObjects()
    local influenceCount = 0
    local garrisonCount = 0
    for _, item in ipairs(items) do
      if item.tag == "Block" and influenceCount < 4 then
        influenceCount = influenceCount + 1
        item.setPositionSmooth(Vector(influenceSpots["Green"][influenceCount]),false,true)
        item.setRotationSmooth({0,180,0})
      elseif item.tag == "Block" and garrisonCount < (3 + (2 * getObjectFromGUID(firstPlayerToken).getVar("epicMode"))) then
        garrisonCount = garrisonCount + 1
        item.setPositionSmooth(Vector(garrisonSpots["Green"][garrisonCount]),false,true)
        item.setRotationSmooth({0,180,0})
      end
    end
    if getObjectFromGUID(firstPlayerToken).getVar("epicMode") == 1 then
      Wait.frames(function()
        starterDeck.deal(5, "Green")
      end,120)
    else
      starterDeck.deal(5, "Green")
    end

    getObjectFromGUID("f8a49f").call("boardSetup", {})
    playSeat[4] = 1

  end

  if playerCount == 2 then
    twoPlayerSetupStart()
  elseif playerCount == 1 then
    onePlayerSetupStart()
  end

  getObjectFromGUID("400db5").call("bagLabel", {})
  getObjectFromGUID("5090e6").call("bagLabel", {})
  getObjectFromGUID("3f6168").call("bagLabel", {})
  getObjectFromGUID("85289a").call("bagLabel", {})
  getObjectFromGUID("3d38e5").call("bagLabel", {})

  if playerCount > 1 then
    getObjectFromGUID("2da390").call("conflictSetup",{})
    getObjectFromGUID("2da390").call("changeScore",{})
    sendAgentSetup()
    sendConflictButtons()
    getObjectFromGUID("2da390").call("drawConflict",{})
    broadcastToAll("Initial Conflict Card Drawn!")
    Wait.frames(function() startGOM() end,20)

    for i=1,4 do
      local leaderArea = getObjectFromGUID(hagalZones[i]).getObjects()
      for _, itemA in ipairs(leaderArea) do
        if itemA.getDescription() == "Leader" and itemA.getName() != "Baron Harkonnen" then
          destroyObject(getObjectFromGUID(hiddenPlayerZones[i]))
        end
      end
    end

  end

  inProgress = 1

  --for i=1,4 do
    --getObjectFromGUID(redBowls[i]).call("loadBowl",{})
    --getObjectFromGUID(blueBowls[i]).call("loadBowl",{})
    --getObjectFromGUID(orangeBowls[i]).call("loadBowl",{})
    --getObjectFromGUID(greenBowls[i]).call("loadBowl",{})
  --end

  if playerCount > 2 then
    getObjectFromGUID("a2ace8").call("raiseLabels", {})
    getObjectFromGUID("f6cbd0").call("raiseLabels", {})
    getObjectFromGUID("410349").call("raiseLabels", {})
    getObjectFromGUID(hagalBag).clearButtons()
    getObjectFromGUID("dee0f6").clearButtons()
    if getObjectFromGUID(firstPlayerToken).getVar("riseIX") == 1 then
      getObjectFromGUID("ab1ce9").call("phaseTileCheck", {})
    end
  end

  broadcastToAll("Initial Setup Complete!")
  clearLeaderLabels()

  return 1
end

function GetDeckOrCard(zoneGUID)
  for _, obj in ipairs(getObjectFromGUID(zoneGUID).getObjects()) do
    if obj.name == "Card" or obj.name == "CardCustom" or obj.name == "Deck" or obj.name == "DeckCustom" then
      return obj
    end
  end

 return nil
end

function cardAquire(GO, color)
  GO.clearButtons()
  local cardPos = GO.getPosition()

  cardPos.y = 3

  cardDraw = GetDeckOrCard(imperiumDeckZone)

  if color == "Red" then
    discardPos = {-35.39, 2, -12.89}
    discardRot = {0.00, 180.00, 0.00}
    GO.setPositionSmooth(discardPos)
    GO.setRotationSmooth(discardRot)
  elseif color == "Blue" then
    discardPos = {-10.39, 2, -12.89}
    discardRot = {0.00, 180.00, 0.00}
    GO.setPositionSmooth(discardPos)
    GO.setRotationSmooth(discardRot)
  elseif color == "Orange" then
    discardPos = {19.61, 2, -12.89}
    discardRot = {0.00, 180.00, 0.00}
    GO.setPositionSmooth(discardPos)
    GO.setRotationSmooth(discardRot)
  elseif color == "Green" then
    discardPos = {44.61, 2, -12.89}
    discardRot = {0.00, 180.00, 0.00}
    GO.setPositionSmooth(discardPos)
    GO.setRotationSmooth(discardRot)
  end

  if GO.getName() == "The Voice" then
    local tokenCheck = getObjectFromGUID("926082").getObjects()
      for _, itemC in ipairs(tokenCheck) do
        if itemC.getName() == "Voice Token" then
          local tokenPos = discardPos
          tokenPos[1] = (tokenPos[1] - 4.61)
          tokenPos[3] = -15.75
          itemC.setPositionSmooth(tokenPos,false,true)
          break
        end
      end
  end


  if cardDraw != nil then
   if cardDraw.name == "Deck" then
    card = cardDraw.takeObject({position = cardPos, flip = true})
   elseif cardDraw.name == "Card" then
    card = cardDraw
    card.flip()
    card.setPositionSmooth(cardPos, false, true)
   end
  else
    printToAll("No Imperium Cards Available!")
  end
end

function cardAquireResearch(GO, color)
  GO.clearButtons()
  local cardPos = GO.getPosition()

  local researchTokenPosition = getObjectFromGUID(researchTokens[colorRef[color]]).getPosition()
  local geneticMarkerPos = researchTokenPosition.x

  cardPos.y = 12.75

  cardDraw = GetDeckOrCard(researchDeckZone)

  if color == "Red" then
    if geneticMarkerPos >= 6.85 then
      discardPos = {-44.61, 2, -12.89}
      discardRot = {0.00, 180.00, 180.00}
    else
      discardPos = {-35.39, 2, -12.89}
      discardRot = {0.00, 180.00, 0.00}
    end
    GO.setPositionSmooth(discardPos)
    GO.setRotationSmooth(discardRot)
  elseif color == "Blue" then
    if geneticMarkerPos >= 6.85 then
      discardPos = {-19.61, 2, -12.89}
      discardRot = {0.00, 180.00, 180.00}
    else
      discardPos = {-10.39, 2, -12.89}
      discardRot = {0.00, 180.00, 0.00}
    end
    GO.setPositionSmooth(discardPos)
    GO.setRotationSmooth(discardRot)
  elseif color == "Orange" then
    if geneticMarkerPos >= 6.85 then
      discardPos = {10.39, 2, -12.89}
      discardRot = {0.00, 180.00, 180.00}
    else
      discardPos = {19.61, 2, -12.89}
      discardRot = {0.00, 180.00, 0.00}
    end
    GO.setPositionSmooth(discardPos)
    GO.setRotationSmooth(discardRot)
  elseif color == "Green" then
    if geneticMarkerPos >= 6.85 then
      discardPos = {35.39, 2, -12.89}
      discardRot = {0.00, 180.00, 180.00}
    else
      discardPos = {44.61, 2, -12.89}
      discardRot = {0.00, 180.00, 0.00}
    end
    GO.setPositionSmooth(discardPos)
    GO.setRotationSmooth(discardRot)
  end

  if GO.getName() == "The Voice" then
    local tokenCheck = getObjectFromGUID("926082").getObjects()
      for _, itemC in ipairs(tokenCheck) do
        if itemC.getName() == "Voice Token" then
          local tokenPos = discardPos
          tokenPos[1] = (tokenPos[1] - 4.61)
          tokenPos[3] = -15.75
          itemC.setPositionSmooth(tokenPos,false,true)
          break
        end
      end
  end


  if cardDraw != nil then
   if cardDraw.name == "Deck" then
    card = cardDraw.takeObject({position = cardPos, flip = true})
   elseif cardDraw.name == "Card" then
    card = cardDraw
    card.flip()
    card.setPositionSmooth(cardPos, false, true)
   end
  else
    printToAll("No Imperium Cards Available!")
  end
end

function onObjectEnterScriptingZone(zone,obj)
  if zone.getGUID() == "13f1b8" and obj.getDescription() == "Leader" and inProgress == 0 then
    obj.call("claimLabel",{})
    Wait.frames(function()
      if obj.getGUID() == "1244ec" then
        Wait.frames(function()
          leaderPos = getObjectFromGUID("1244ec").getPosition()
          leaderPos.y = leaderPos.y + 0.5
          getObjectFromGUID("48697e").setPositionSmooth(leaderPos)
          leaderPos.y = leaderPos.y + 0.5
          getObjectFromGUID("f81ccf").setPositionSmooth(leaderPos)
          leaderPos.y = leaderPos.y + 0.5
          getObjectFromGUID("4b913e").setPositionSmooth(leaderPos)
          leaderPos.y = leaderPos.y + 0.5
          getObjectFromGUID("e1d7b4").setPositionSmooth(leaderPos)
        end, 30)
      elseif obj.getGUID() == "98cae8" then
        Wait.frames(function()
          leaderPos = getObjectFromGUID("98cae8").getPosition()
          leaderPos.y = leaderPos.y + 0.5
          getObjectFromGUID("690202").setPositionSmooth(leaderPos)
          leaderPos.y = leaderPos.y + 0.5
          getObjectFromGUID("cd9759").setPositionSmooth(leaderPos)
          leaderPos.y = leaderPos.y + 0.5
          getObjectFromGUID("88e4de").setPositionSmooth(leaderPos)
          leaderPos.y = leaderPos.y + 0.5
          getObjectFromGUID("dadf18").setPositionSmooth(leaderPos)
        end, 30)
      end
    end,30)
  end
  if zone.getGUID() == "0cdd8e" and obj.getDescription() == "Leader" and inProgress == 0 then
    obj.call("claimLabel",{})
    Wait.frames(function()
      if obj.getGUID() == "1244ec" and inProgress == 1 then
        Wait.frames(function()
          leaderPos = getObjectFromGUID("1244ec").getPosition()
          leaderPos.y = leaderPos.y + 0.5
          getObjectFromGUID("48697e").setPositionSmooth(leaderPos)
          leaderPos.y = leaderPos.y + 0.5
          getObjectFromGUID("f81ccf").setPositionSmooth(leaderPos)
          leaderPos.y = leaderPos.y + 0.5
          getObjectFromGUID("4b913e").setPositionSmooth(leaderPos)
          leaderPos.y = leaderPos.y + 0.5
          getObjectFromGUID("e1d7b4").setPositionSmooth(leaderPos)
        end, 30)
      elseif obj.getGUID() == "98cae8" then
        Wait.frames(function()
          leaderPos = getObjectFromGUID("98cae8").getPosition()
          leaderPos.y = leaderPos.y + 0.5
          getObjectFromGUID("690202").setPositionSmooth(leaderPos)
          leaderPos.y = leaderPos.y + 0.5
          getObjectFromGUID("cd9759").setPositionSmooth(leaderPos)
          leaderPos.y = leaderPos.y + 0.5
          getObjectFromGUID("88e4de").setPositionSmooth(leaderPos)
          leaderPos.y = leaderPos.y + 0.5
          getObjectFromGUID("dadf18").setPositionSmooth(leaderPos)
        end, 30)
      end
    end,30)
  end
  if zone.getGUID() == "019932" and obj.getDescription() == "Leader" or zone.getGUID() == "922c70" and obj.getDescription() == "Leader" or zone.getGUID() == "5fbaf4" and obj.getDescription() == "Leader" or zone.getGUID() == "cef5cb" and obj.getDescription() == "Leader" then
    Wait.frames(function()
      if obj.getGUID() == "1244ec" then
        for i=1,4 do
          getObjectFromGUID(snooperTokens[i]).setPositionSmooth(snooperPosition[i])
          getObjectFromGUID(snooperTokens[i]).setRotationSmooth(snooperRotation[i])
        end
      elseif obj.getGUID() == "98cae8" and zone.getGUID() == "019932" then
        for i=1, 4 do
          if getObjectFromGUID(hiddenPlayerZones[1]) ~= nil then
            local hiddenPos = getObjectFromGUID(hiddenPlayerZones[1]).getPosition()
            hiddenPos.x = hiddenPos.x + offsetHidden[i]
            hiddenPos.y = 1.5
            hiddenPos.z = -8
            getObjectFromGUID(harkonnenTokens[i]).setPositionSmooth(hiddenPos)
            getObjectFromGUID(harkonnenTokens[i]).setRotationSmooth({0.00, 180.00, 0.00})
          end
        end
      elseif obj.getGUID() == "98cae8" and zone.getGUID() == "922c70" then
        for i=1, 4 do
          if getObjectFromGUID(hiddenPlayerZones[2]) ~= nil then
            local hiddenPos = getObjectFromGUID(hiddenPlayerZones[2]).getPosition()
            hiddenPos.x = hiddenPos.x + offsetHidden[i]
            hiddenPos.y = 1.5
            hiddenPos.z = -8
            getObjectFromGUID(harkonnenTokens[i]).setPositionSmooth(hiddenPos)
            getObjectFromGUID(harkonnenTokens[i]).setRotationSmooth({0.00, 180.00, 0.00})
          end
        end
      elseif obj.getGUID() == "98cae8" and zone.getGUID() == "5fbaf4" then
        for i=1, 4 do
          if getObjectFromGUID(hiddenPlayerZones[3]) ~= nil then
            local hiddenPos = getObjectFromGUID(hiddenPlayerZones[3]).getPosition()
            hiddenPos.x = hiddenPos.x + offsetHidden[i]
            hiddenPos.y = 1.5
            hiddenPos.z = -8
            getObjectFromGUID(harkonnenTokens[i]).setPositionSmooth(hiddenPos)
            getObjectFromGUID(harkonnenTokens[i]).setRotationSmooth({0.00, 180.00, 0.00})
          end
        end
      elseif obj.getGUID() == "98cae8" and zone.getGUID() == "cef5cb" then
        for i=1, 4 do
          if getObjectFromGUID(hiddenPlayerZones[4]) ~= nil then
            local hiddenPos = getObjectFromGUID(hiddenPlayerZones[4]).getPosition()
            hiddenPos.x = hiddenPos.x + offsetHidden[i]
            hiddenPos.y = 1.5
            hiddenPos.z = -8
            getObjectFromGUID(harkonnenTokens[i]).setPositionSmooth(hiddenPos)
            getObjectFromGUID(harkonnenTokens[i]).setRotationSmooth({0.00, 180.00, 0.00})
          end
        end
      end
    end,30)
  end
  if zone.getGUID() == "b07d0e" and obj.getDescription() == "Leader" and inProgress == 0 then
    obj.call("claimLabel",{})
    Wait.frames(function()
      if obj.getGUID() == "1244ec" then
        Wait.frames(function()
          leaderPos = getObjectFromGUID("1244ec").getPosition()
          leaderPos.y = leaderPos.y + 0.5
          getObjectFromGUID("48697e").setPositionSmooth(leaderPos)
          leaderPos.y = leaderPos.y + 0.5
          getObjectFromGUID("f81ccf").setPositionSmooth(leaderPos)
          leaderPos.y = leaderPos.y + 0.5
          getObjectFromGUID("4b913e").setPositionSmooth(leaderPos)
          leaderPos.y = leaderPos.y + 0.5
          getObjectFromGUID("e1d7b4").setPositionSmooth(leaderPos)
        end,30)
      elseif obj.getGUID() == "98cae8" then
        Wait.frames(function()
          leaderPos = getObjectFromGUID("98cae8").getPosition()
          leaderPos.y = leaderPos.y + 0.5
          getObjectFromGUID("690202").setPositionSmooth(leaderPos)
          leaderPos.y = leaderPos.y + 0.5
          getObjectFromGUID("cd9759").setPositionSmooth(leaderPos)
          leaderPos.y = leaderPos.y + 0.5
          getObjectFromGUID("88e4de").setPositionSmooth(leaderPos)
          leaderPos.y = leaderPos.y + 0.5
          getObjectFromGUID("dadf18").setPositionSmooth(leaderPos)
        end, 30)
      end
    end,30)
  end

  if zone.getGUID() == "85a5fe" or zone.getGUID() == "52cc32" or zone.getGUID() == "2f3821" or zone.getGUID() == "a4f598" or zone.getGUID() == "b17148" then
    if obj.name == "Card" or obj.name == "CardCustom" then

    obj.createButton({
     click_function = "cardAquire",
     function_owner = self,
     label          = "Acquire",
     position       = {0,0.30,1.8},
     rotation       = {0, 0, 0},
     scale          = {1, 1, 1},
     width          = 800,
     height         = 250,
     tooltip        = "",
     font_color     = {1, 1, 1},
     font_size      = 150,
     color          = {0, 0, 0}
     })
    end
  end

  --if zone.getGUID() == "13f1b8" and obj.getDescription() == "Leader" then
    --obj.call("onLoad", {})
  --end

  --if zone.getGUID() == "02ca0a" and obj.tag == "Block" then
    --startLuaCoroutine(self, "troopCount")
  --end

  if zone.getGUID() == "7954ec" or zone.getGUID() == "fb42f0" then
    if obj.name == "Card" or obj.name == "CardCustom" then

    obj.createButton({
    click_function = "cardAquireResearch",
    function_owner = self,
    label          = "Acquire",
    position       = {0,0.30,1.8},
    rotation       = {0, 0, 0},
    scale          = {1, 1, 1},
    width          = 800,
    height         = 250,
    tooltip        = "",
    font_color     = {1, 1, 1},
    font_size      = 150,
    color          = {0, 0, 0}
    })
    end
  end

--if zone.getGUID() == "13f1b8" and obj.getDescription() == "Leader" then
  --obj.call("onLoad", {})
--end

--if zone.getGUID() == "02ca0a" and obj.tag == "Block" then
  --startLuaCoroutine(self, "troopCount")
--end

end

function troopCount()
  local Time = os.clock() + 1.0
    while os.clock() < Time do
      coroutine.yield(0)
    end

  local troopCount = {0,0,0,0}
  local combatTokens = getObjectFromGUID("02ca0a").getObjects()

  for _, item in ipairs(combatTokens) do
    if item.tag == "Block" then
      if item.getName() == "Red" then
        troopCount[1] = troopCount[1] + 1
      elseif item.getName() == "Blue" then
        troopCount[2] = troopCount[2] + 1
      elseif item.getName() == "Orange" then
        troopCount[3] = troopCount[3] + 1
      elseif item.getName() == "Green" then
        troopCount[4] = troopCount[4] + 1
      end
    end
  end

  printToAll("Troops in Conflict")
  printToAll("------------------")

  for i=1,4 do
    if rivals[i] == 1 or playSeat[i] == 1 then
      if troopCount[i] == 1 then
        printToAll(defaultColorList[i] .. ": " .. troopCount[i] .. " Troop")
      elseif troopCount[i] > 1 then
        printToAll(defaultColorList[i] .. ": " .. troopCount[i] .. " Troops")
      else
        printToAll(defaultColorList[i] .. ": 0")
      end
    end
  end
end

function onObjectLeaveScriptingZone(zone, obj)
  if zone.getGUID() == "c640b3" and obj.name == "Card" then
    obj.clearButtons()
  end

  if zone.getGUID() == "c062c3" and obj.name == "Card" then
    obj.clearButtons()
  end

  if zone.getGUID() == "c640b3" and obj.name == "CardCustom" then
    obj.clearButtons()
  end

  if zone.getGUID() == "c062c3" and obj.name == "CardCustom" then
    obj.clearButtons()
  end

  if zone.getGUID() == "02ca0a" and obj.getGUID() == "784534" then
    obj.clearButtons()
  end

  if zone.getGUID() == "13f1b8" and obj.getDescription() == "Leader" then
    obj.clearButtons()
  end

  if zone.getGUID() == "0cdd8e" and obj.getDescription() == "Leader" then
    obj.clearButtons()
  end

  if zone.getGUID() == "b07d0e" and obj.getDescription() == "Leader" then
    obj.clearButtons()
  end

  --if zone.getGUID() == "02ca0a" and obj.tag == "Block" then
    --startLuaCoroutine(self, "troopCount")
  --end

  --if zone.getGUID() == "ad3c5a" and obj.name == "Card" then
    --if obj.name == "Card" or obj.name == "CardCustom" then
     --obj.createButton({
     --click_function = "cardAquire",
     --function_owner = self,
     --label          = "Acquire",
     --position       = {0,0.30,1.8},
     --rotation       = {0, 0, 0},
     --scale          = {1, 1, 1},
     --width          = 800,
     --height         = 250,
     --tooltip        = "",
     --font_color     = {1, 1, 1},
     --font_size      = 150,
     --color          = {0, 0, 0}
     --})
    --end
  --end
end

function twoPlayerSetupStart()
  startLuaCoroutine(self, "twoPlayerSetup")
end

function twoPlayerSetup()
  houseHagal = 0
  mainDeck = ""
  additionalDeck = ""
  extraDeck = ""
  churnDeckOne = ""
  churnDeckTwo = ""
  buttonRef = ""
  tempSpots = {{30.50, 3.75, 21.00}, {30.50, 3.75, 18.00}, {30.50, 3.75, 15.00}, {30.50, 3.75, 12.00}, {30.50, 3.75, 9.00}, {30.50, 3.75, 6.00}}

  for i=1,4 do
    if playSeat[i] == 0 then
      getObjectFromGUID(trashBin).putObject(GetDeckOrCard(starterDeckZones[i]))

      if houseHagal == 0 then
        for i=1,6 do
          local deckPull = getObjectFromGUID(hagalBag).takeObject({position = tempSpots[i]})
          if deckPull.getDescription() == "House Hagal" then
            buttonRef = deckPull
          elseif deckPull.getQuantity() == 20 or deckPull.getQuantity() == 21 or deckPull.getQuantity() == 23 or deckPull.getQuantity() == 24 then
            mainDeck = deckPull
          elseif deckPull.getQuantity() == 4 or deckPull.getQuantity() == 6 then
            additionalDeck = deckPull
          elseif deckPull.getQuantity() == 3 or deckPull.getQuantity() == 7 or deckPull.getQuantity() == 11 then
            extraDeck = deckPull
          elseif deckPull.getQuantity() == 2 then
            churnDeckOne = deckPull
          else
            churnDeckTwo = deckPull
          end
        end

        getObjectFromGUID(rivalBoards[i]).call("boardSetup", {})
        getObjectFromGUID(rivalBoards[i]).call("rivalSetup", {})
        getObjectFromGUID(rivalBoards[i]).call("rivalButtons", {})

        mainDeck.setPositionSmooth(hagalSpots[i],false,true)
        mainDeck.setRotationSmooth(hagalRot[i])
        additionalDeck.setPositionSmooth(hagalSpots[i],false,true)
        additionalDeck.setRotationSmooth(hagalRot[i])
        if getObjectFromGUID("aaec7d").getVar("churnCheck") == 1 then
          churnDeckTwo.setPositionSmooth(hagalSpots[i],false,true)
          churnDeckTwo.setRotationSmooth(hagalRot[i])
        else
          getObjectFromGUID(hagalBag).putObject(churnDeckTwo)
        end
        buttonRef.setPositionSmooth(hagalButtonSpots[i],false,true)
        buttonRef.setRotationSmooth({0,180,0})
        getObjectFromGUID("9356f0").setPositionSmooth(hagalCombatSpots[i],false,true)
        Wait.frames(function()
          buttonRef.setLock(true)
          getObjectFromGUID("9356f0").setLock(true)
        end, 90)
        getObjectFromGUID(hagalBag).putObject(extraDeck)
        getObjectFromGUID(hagalBag).putObject(churnDeckOne)
        getObjectFromGUID(hagalBag).clearButtons()
        getObjectFromGUID("dee0f6").clearButtons()
        if getObjectFromGUID(firstPlayerToken).getVar("riseIX") == 1 then
          getObjectFromGUID("ab1ce9").call("phaseTileCheck", {})
        end

        getObjectFromGUID(combatTokens[i]).setPositionSmooth(combatTokenSpots[i],false, true)
        getObjectFromGUID(combatTokens[i]).setRotationSmooth({0,180,0})

        local Time = os.clock() + 1
          while os.clock() < Time do
            coroutine.yield(0)
          end

        local items = getObjectFromGUID(supplyZones[i]).getObjects()
        local influenceCount = 0

        for _, item in ipairs(items) do
          if item.tag == "Block" and influenceCount < 4 then
            influenceCount = influenceCount + 1
            item.setPositionSmooth(Vector(influenceSpots[defaultColorList[i]][influenceCount]),false,true)
            item.setRotationSmooth({0,180,0})
          end
        end

        hagalDeck = GetDeckOrCard(hagalZones[i])

        local Time = os.clock() + 0.5
          while os.clock() < Time do
            coroutine.yield(0)
          end

        hagalDeck.shuffle()
        hagalDeck.shuffle()

        hagalSpot = i

        rivals[i] = 1

        houseHagal = 1
      end

    end

  end

  --getObjectFromGUID("2da390").call("adjustConflictDraw", {})

  inProgress = 1
  if rivals[1] == 1 then
    params = {1}
  elseif rivals[2] == 1 then
    params = {2}
  elseif rivals[3] == 1 then
    params = {3}
  elseif rivals[4] == 1 then
    params = {4}
  end
  getObjectFromGUID("f1a7d1").call("rivalButtonUpdate",{params})

  for i=1,4 do
    if rivals[i] == 1 then
      destroyObject(getObjectFromGUID(hiddenPlayerZones[i]))
      if getObjectFromGUID(firstPlayerToken).getVar("immortality") == 1 then
        destroyObject(getObjectFromGUID(ResearchTokens[i]))
        destroyObject(getObjectFromGUID(TleilaxuTokens[i]))
      end
    elseif rivals[i] == 0 and playSeat[i] == 0 then
      destroyObject(getObjectFromGUID(hiddenPlayerZones[i]))
      if getObjectFromGUID(firstPlayerToken).getVar("immortality") == 1 then
        destroyObject(getObjectFromGUID(ResearchTokens[i]))
        destroyObject(getObjectFromGUID(TleilaxuTokens[i]))
      end
    end
  end

  getObjectFromGUID("a2ace8").call("raiseLabels", {})
  getObjectFromGUID("f6cbd0").call("raiseLabels", {})
  getObjectFromGUID("410349").call("raiseLabels", {})
  pullRivalRulesImp()

  broadcastToAll("Two Player Setup Complete!")
  clearLeaderLabels()

  return 1
end

function onePlayerSetupStart()
  getObjectFromGUID("2da390").call("onePlayerSetup",{})
end

function onePlayerSetupContinue()
  --rivalSelection()
  startLuaCoroutine(self, "onePlayerSetup")
end

function onePlayerSetup()
  houseHagal = 0
  rivalCount = 0
  mainDeck = ""
  additionalDeck = ""
  extraDeck = ""
  churnDeckOne = ""
  churnDeckTwo = ""
  buttonRef = ""
  tempSpots = {{30.50, 3.75, 21.00}, {30.50, 3.75, 18.00}, {30.50, 3.75, 15.00}, {30.50, 3.75, 12.00}, {30.50, 3.75, 9.00}, {30.50, 3.75, 6.00}}

  level = getObjectFromGUID("2da390").getVar("difficultyLevel")

  local selectedRivals = getObjectFromGUID("2da390").getVar("selectedColors")
  for i=1, 4 do
    selectedRivalsSave[i] = selectedRivals[i]
  end


  for i=1,4 do
    if selectedRivals[i] == 1 then
      getObjectFromGUID(trashBin).putObject(GetDeckOrCard(starterDeckZones[i]))

      if rivalCount == 0 then
        getObjectFromGUID(rivalBoards[i]).call("boardSetup", {})
        getObjectFromGUID(rivalBoards[i]).call("rivalSetup", {})
        getObjectFromGUID(rivalBoards[i]).call("rivalButtons", {})

        local items = getObjectFromGUID(supplyZones[i]).getObjects()
        local influenceCount = 0
        local garrisonCount = 0
        local level = getObjectFromGUID("2da390").getVar("difficultyLevel")

        for _, item in ipairs(items) do
          if item.tag == "Block" and influenceCount < 4 then
            influenceCount = influenceCount + 1
            item.setPositionSmooth(Vector(influenceSpots[defaultColorList[i]][influenceCount]),false,true)
            item.setRotationSmooth({0,180,0})
          elseif level != 1 and item.tag == "Block" and garrisonCount < 3 then
            garrisonCount = garrisonCount + 1
            item.setPositionSmooth(Vector(garrisonSpots[defaultColorList[i]][garrisonCount]),false,true)
            item.setRotationSmooth({0,180,0})
          end
        end

        rivals[i] = 1
        rivalCount = 1

      elseif rivalCount == 1 then
        local items = getObjectFromGUID(supplyZones[i]).getObjects()
        local influenceCount = 0
        local garrisonCount = 0
        local level = getObjectFromGUID("2da390").getVar("difficultyLevel")

        getObjectFromGUID(rivalBoards[i]).call("boardSetup", {})
        getObjectFromGUID(rivalBoards[i]).call("rivalSetup", {})
        getObjectFromGUID(rivalBoards[i]).call("rivalButtons", {})

        for _, item in ipairs(items) do
          if item.tag == "Block" and influenceCount < 4 then
            influenceCount = influenceCount + 1
            item.setPositionSmooth(Vector(influenceSpots[defaultColorList[i]][influenceCount]),false,true)
            item.setRotationSmooth({0,180,0})
          elseif level != 1 and item.tag == "Block" and garrisonCount < 3 then
            garrisonCount = garrisonCount + 1
            item.setPositionSmooth(Vector(garrisonSpots[defaultColorList[i]][garrisonCount]),false,true)
            item.setRotationSmooth({0,180,0})
          end
        end
        rivals[i] = 1
        rivalCount = 2
      end
    end
  end
  for i=1,4 do
    if playSeat[i] != 1 and selectedRivals[i] != 1 then
      getObjectFromGUID(trashBin).putObject(GetDeckOrCard(starterDeckZones[i]))

      for i=1,6 do
        local deckPull = getObjectFromGUID(hagalBag).takeObject({position = tempSpots[i]})
        if deckPull.getDescription() == "House Hagal" then
          buttonRef = deckPull
        elseif deckPull.getQuantity() == 20 or deckPull.getQuantity() == 21 or deckPull.getQuantity() == 23 or deckPull.getQuantity() == 24 then
          mainDeck = deckPull
        elseif deckPull.getQuantity() == 3 or deckPull.getQuantity() == 7 or deckPull.getQuantity() == 11 then
          additionalDeck = deckPull
        elseif deckPull.getQuantity() == 4 or deckPull.getQuantity() == 6 then
          extraDeck = deckPull
        elseif deckPull.getQuantity() == 2 then
          churnDeckOne = deckPull
        else
          churnDeckTwo = deckPull
        end
      end

      mainDeck.setPositionSmooth(hagalSpots[i],false,true)
      mainDeck.setRotationSmooth(hagalRot[i])
      additionalDeck.setPositionSmooth(hagalSpots[i],false,true)
      additionalDeck.setRotationSmooth(hagalRot[i])
      if getObjectFromGUID("aaec7d").getVar("churnCheck") == 1 then
        churnDeckOne.setPositionSmooth(hagalSpots[i],false,true)
        churnDeckOne.setRotationSmooth(hagalRot[i])
      else
        getObjectFromGUID(hagalBag).putObject(churnDeckOne)
      end
      buttonRef.setPositionSmooth(hagalButtonSpots[i],false,true)
      buttonRef.setRotationSmooth({0,180,0})
      getObjectFromGUID("9356f0").setPositionSmooth(hagalCombatSpots[i],false,true)
      Wait.frames(function()
        buttonRef.setLock(true)
        getObjectFromGUID("9356f0").setLock(true)
      end, 90)
      getObjectFromGUID(hagalBag).putObject(extraDeck)
      getObjectFromGUID(hagalBag).putObject(churnDeckTwo)
      getObjectFromGUID(hagalBag).clearButtons()
      getObjectFromGUID("dee0f6").clearButtons()
      if getObjectFromGUID(firstPlayerToken).getVar("riseIX") == 1 then
        getObjectFromGUID("ab1ce9").call("phaseTileCheck", {})
      end


      local Time = os.clock() + 1.5
        while os.clock() < Time do
          coroutine.yield(0)
        end

      hagalDeck = GetDeckOrCard(hagalZones[i])

      hagalSpot = i

      hagalDeck.shuffle()
      hagalDeck.shuffle()
    end

  end

  conflictTemp = GetDeckOrCard("df61c3")

  for i=1, (6-level) do
    conflictTemp.takeObject({position = {-0.79, 2, -3.33}})

    local Time = os.clock() + 0.25
      while os.clock() < Time do
        coroutine.yield(0)
      end
  end

  for i=1,4 do
    if rivals[i] == 1 then
      getObjectFromGUID(swordMasterTokens[i]).setRotation({90,0,0})
      getObjectFromGUID(swordMasterTokens[i]).setPositionSmooth({-3.27, 1+i, -4},false,true)

      getObjectFromGUID(scoreTokens[i]).setPositionSmooth(scoreTrackSpots[scoreTokenSetup])
      getObjectFromGUID(scoreTokens[i]).setRotationSmooth({0,180,0})
      getObjectFromGUID(combatTokens[i]).setPositionSmooth(combatTokenSpots[i],false, true)
      getObjectFromGUID(combatTokens[i]).setRotationSmooth({0,180,0})
      if getObjectFromGUID(firstPlayerToken).getVar("riseIX") == 1 then
        getObjectFromGUID(freighterTokens[i]).setPositionSmooth(freighterStartPosition[i], false, true)
        getObjectFromGUID(freighterTokens[i]).setRotationSmooth({0,180,0})
      end

      getObjectFromGUID(councilorTokens[i]).setPositionSmooth(swordMasterStart[i], false, true)

      if i == 1 then
        bowlCheck = redBowls
      elseif i == 2 then
        bowlCheck = blueBowls
      elseif i == 3 then
        bowlCheck = orangeBowls
      elseif i == 4 then
        bowlCheck = greenBowls
      end

      for j=1,3 do
        getObjectFromGUID(bowlCheck[j]).call("setSolo", {})
      end

      if level != 1 then
        if i == 1 then
          intrigueRot = {0.00, 180.00, 180.00}
        elseif i == 2 then
          intrigueRot = {0.00, 180.00, 180.00}
        elseif i == 3 then
          intrigueRot = {0.00, 180.00, 180.00}
        elseif i == 4 then
          intrigueRot = {0.00, 180.00, 180.00}
        end

        intrigueDeck = GetDeckOrCard(intrigueDeckZone)
        intriguePos = getObjectFromGUID(starterDeckZones[i]).getPosition()
        intrigueDeck.takeObject({rotation = intrigueRot, position = intriguePos})
      end

      local Time = os.clock() + 1
        while os.clock() < Time do
          coroutine.yield(0)
        end
    end
  end

  for i=1, (6-level) do
    conflictTemp = GetDeckOrCard("4a21d4")
    if i < (6-level) then
      conflictTemp.takeObject({position = {-3.27, 4, -3.27}})
    elseif i == (6-level) then
      Wait.frames(function()
        conflictTemp.setPositionSmooth({-3.27, 4, -3.27})
      end, 30)
    end

    local Time = os.clock() + 0.25
      while os.clock() < Time do
        coroutine.yield(0)
      end
  end

  if level == 1 then
    if Player["Red"].seated then
      solarisPos = {-49.00, 4, -13.00}
      spicePos = {-49.00, 4, -19.00}
      tokenRot = {0,180,0}
    elseif Player["Blue"].seated then
      solarisPos = {-6.00, 4, -13.00}
      spicePos = {-6.00, 4, -19.00}
      tokenRot = {0,180,0}
    elseif Player["Orange"].seated then
      solarisPos = {6.00, 4, -13.00}
      spicePos = {6.00, 4, -19.00}
      tokenRot = {0,180,0}
    elseif Player["Green"].seated then
      solarisPos = {49.00, 4, -13.00}
      spicePos = {49.00, 4, -19.00}
      tokenRot ={0,180,0}
    end

    getObjectFromGUID("5090e6").takeObject({position = solarisPos, rotation = tokenRot})
    getObjectFromGUID("85289a").takeObject({position = spicePos, rotation = tokenRot})
  end

  if level != 1 then
    if getObjectFromGUID(firstPlayerToken).getVar("riseIX") == 1 then
      local mentatPrice = getObjectFromGUID("3f6168").takeObject({position = {-4.18, 1.31, 11.30}, rotation = {0.00, 180.00, 0.00}})
      mentatPrice.setScale({0.11, 1.00, 0.11})

      local Time = os.clock() + 2
        while os.clock() < Time do
          coroutine.yield(0)
        end

      mentatPrice.setLock(true)
    else
      local mentatPrice = getObjectFromGUID("3f6168").takeObject({position = {-3.87, 1.16, 11.90}, rotation = {0.00, 180.00, 0.00}})
      mentatPrice.setScale({0.11, 1.00, 0.11})

      local Time = os.clock() + 2
        while os.clock() < Time do
          coroutine.yield(0)
        end

      mentatPrice.setLock(true)
    end
  end

  if getObjectFromGUID("2da390").getVar("expertPlus") == 4 then
    if Player["Red"].seated then
      getObjectFromGUID(trashBin).putObject(getObjectFromGUID(swordMasterTokens[1]))
    elseif Player["Blue"].seated then
      getObjectFromGUID(trashBin).putObject(getObjectFromGUID(swordMasterTokens[2]))
    elseif Player["Orange"].seated then
      getObjectFromGUID(trashBin).putObject(getObjectFromGUID(swordMasterTokens[3]))
    elseif Player["Green"].seated then
      getObjectFromGUID(trashBin).putObject(getObjectFromGUID(swordMasterTokens[4]))
    end
  end

  firstToken = getObjectFromGUID("784534")

  if Player["Red"].seated then
    if rivals[4] == 1 then
      firstToken.setPositionSmooth({40, 4, -7.00})
      firstToken.setRotationSmooth({0.00, 180.00, 0.00})
      broadcastToAll("Green Rival Goes First!", stringColorToRGB("Green"))
      params = {4}
      firstToken.call("updateCurrent",params)
      firstToken.call("saveRival",params)
    elseif rivals[3] == 1 then
      firstToken.setPositionSmooth({15.00, 4, -7.00})
      firstToken.setRotationSmooth({0.00, 180.00, 0.00})
      broadcastToAll("Orange Rival Goes First!", stringColorToRGB("Orange"))
      params = {3}
      firstToken.call("updateCurrent",params)
      firstToken.call("saveRival",params)
    elseif rivals[2] == 1 then
      firstToken.setPositionSmooth({-15.00, 4, -7.00})
      firstToken.setRotationSmooth({0.00, 180.00, 0.00})
      broadcastToAll("Blue Rival Goes First!", stringColorToRGB("Blue"))
      params = {2}
      firstToken.call("updateCurrent",params)
      firstToken.call("saveRival",params)
    end
    Wait.frames(function()
      --firstToken.call("createPlayerPass",{})
    end,120)
  elseif Player["Blue"].seated then
    if rivals[1] == 1 then
      firstToken.setPositionSmooth({-40, 4, -7.00})
      firstToken.setRotationSmooth({0.00, 180.00, 0.00})
      broadcastToAll("Red Rival Goes First!", stringColorToRGB("Red"))
      params = {1}
      firstToken.call("updateCurrent",params)
      firstToken.call("saveRival",params)
    elseif rivals[4] == 1 then
      firstToken.setPositionSmooth({40, 4, -7.00})
      firstToken.setRotationSmooth({0.00, 180.00, 0.00})
      broadcastToAll("Green Rival Goes First!", stringColorToRGB("Green"))
      params = {4}
      firstToken.call("updateCurrent",params)
      firstToken.call("saveRival",params)
    elseif rivals[3] == 1 then
      firstToken.setPositionSmooth({15.00, 4, -7.00})
      firstToken.setRotationSmooth({0.00, 180.00, 0.00})
      broadcastToAll("Orange Rival Goes First!", stringColorToRGB("Orange"))
      params = {3}
      firstToken.call("updateCurrent",params)
      firstToken.call("saveRival",params)
    end
    Wait.frames(function()
      --firstToken.call("createPlayerPass",{})
    end,120)
  elseif Player["Orange"].seated then
    if rivals[2] == 1 then
      firstToken.setPositionSmooth({-15.00, 4, -7.00})
      firstToken.setRotationSmooth({0.00, 180.00, 0.00})
      broadcastToAll("Blue Rival Goes First!", stringColorToRGB("Blue"))
      params = {2}
      firstToken.call("updateCurrent",params)
      firstToken.call("saveRival",params)
    elseif rivals[1] == 1 then
      firstToken.setPositionSmooth({-40, 4, -7.00})
      firstToken.setRotationSmooth({0.00, 180.00, 0.00})
      broadcastToAll("Red Rival Goes First!", stringColorToRGB("Red"))
      params = {1}
      firstToken.call("updateCurrent",params)
      firstToken.call("saveRival",params)
    elseif rivals[4] == 1 then
      firstToken.setPositionSmooth({40, 4, -7.00})
      firstToken.setRotationSmooth({0.00, 180.00, 0.00})
      broadcastToAll("Green Rival Goes First!", stringColorToRGB("Green"))
      params = {4}
      firstToken.call("updateCurrent",params)
      firstToken.call("saveRival",params)
    end
    Wait.frames(function()
      --firstToken.call("createPlayerPass",{})
    end,120)
  elseif Player["Green"].seated then
    if rivals[3] == 1 then
      firstToken.setPositionSmooth({15.00, 4, -7.00})
      firstToken.setRotationSmooth({0.00, 180.00, 0.00})
      broadcastToAll("Orange Rival Goes First!", stringColorToRGB("Orange"))
      params = {3}
      firstToken.call("updateCurrent",params)
      firstToken.call("saveRival",params)
    elseif rivals[2] == 1 then
      firstToken.setPositionSmooth({-15.00, 4, -7.00})
      firstToken.setRotationSmooth({0.00, 180.00, 0.00})
      broadcastToAll("Blue Rival Goes First!", stringColorToRGB("Blue"))
      params = {2}
      firstToken.call("updateCurrent",params)
      firstToken.call("saveRival",params)
    elseif rivals[1] == 1 then
      firstToken.setPositionSmooth({-40, 4, -7.00})
      firstToken.setRotationSmooth({0.00, 180.00, 0.00})
      broadcastToAll("Red Rival Goes First!", stringColorToRGB("Red"))
      params = {1}
      firstToken.call("updateCurrent",params)
      firstToken.call("saveRival",params)
    end
    --Wait.frames(function()
      --firstToken.call("createPlayerPass",{})
    --end,120)
  end

  getObjectFromGUID("2da390").call("adjustConflictDraw", {})
  getObjectFromGUID("2da390").call("changeScore",{})
  Wait.frames(function()
    getObjectFromGUID("2da390").call("drawConflictTop",{})
    broadcastToAll("Initial Conflict Card Drawn!")
  end, 90)
  sendAgentSetup()
  sendConflictButtons()

  for i=1, 4 do
    destroyObject(getObjectFromGUID(hiddenPlayerZones[i]))
  end

  if getObjectFromGUID(firstPlayerToken).getVar("immortality") == 1 then 
    for i=1, 4 do
      if rivals[i] == 1 or playSeat[i] ~= 1 then 
        destroyObject(getObjectFromGUID(ResearchTokens[i]))
      end
    end
    for i=1, 4 do
      if rivals[i] != 1 and playSeat[i] != 1 then 
        destroyObject(getObjectFromGUID(TleilaxuTokens[i]))
      end
    end
  end

  inProgress = 1

  Wait.frames(function() startGOM() end,20)

  getObjectFromGUID("a2ace8").call("raiseLabels", {})
  getObjectFromGUID("f6cbd0").call("raiseLabels", {})
  getObjectFromGUID("410349").call("raiseLabels", {})
  pullRivalRulesImp()

  broadcastToAll("One Player Setup Complete!")
  clearLeaderLabels()
  Wait.frames(function()
    broadcastToAll("::Reminder::")
    broadcastToAll("Select Rival faction Leaders prior to starting the game")
  end,60)

  return 1
end

function pullRivalRulesImp()
  for _, expansionObject in ipairs(getObjectFromGUID(expansionIX).getObjects()) do
    if expansionObject.guid == imperiumRules then
      expansionComponentA = getObjectFromGUID(expansionIX).takeObject({guid = expansionObject.guid})
      expansionComponentA.setPositionSmooth({-27.50, 1.1, -19.85})
      expansionComponentA.setRotationSmooth({0.00, 180.00, 0.00})
      Wait.frames(function()
        expansionComponentA.lock()
      end,120)
    elseif expansionObject.guid == riseRules and getObjectFromGUID(firstPlayerToken).getVar("riseIX") == 1 then
      expansionComponentB = getObjectFromGUID(expansionIX).takeObject({guid = expansionObject.guid})
      expansionComponentB.setPositionSmooth({27.50, 1.1, -19.85})
      expansionComponentB.setRotationSmooth({0.00, 180.00, 0.00})
      Wait.frames(function()
        expansionComponentB.lock()
      end,120)
    end
  end
end

function sendAgentSetup()
  if getObjectFromGUID(firstPlayerToken).getVar("riseIX") == 1 then
    --High Council
    getObjectFromGUID("10f379").setPositionSmooth({-2.51, 1.21, 14.86},false,true)
    getObjectFromGUID("10f379").setRotationSmooth({0, 180, 0})
    Wait.frames(function()
      getObjectFromGUID("10f379").setLock(true)
    end, 60)
    --Mentat
    getObjectFromGUID("7ede9b").setPositionSmooth({-3.11, 1.21, 12.30},false,true)
    getObjectFromGUID("7ede9b").setRotationSmooth({0, 180, 0})
    Wait.frames(function()
      getObjectFromGUID("7ede9b").setLock(true)
    end, 60)
    --Swordmaster
    getObjectFromGUID("66196a").setPositionSmooth({2.30, 1.21, 12.30},false,true)
    getObjectFromGUID("66196a").setRotationSmooth({0, 180, 0})
    Wait.frames(function()
      getObjectFromGUID("66196a").setLock(true)
    end, 60)
    --Interstellar Shipping
    getObjectFromGUID("219ead").setPositionSmooth({7.45, 1.21, 14.93},false,true)
    getObjectFromGUID("219ead").setRotationSmooth({0, 180, 0})
    Wait.frames(function()
      getObjectFromGUID("219ead").setLock(true)
    end, 60)
    --Smuggling
    getObjectFromGUID("365c78").setPositionSmooth({6.19, 1.21, 12.31},false,true)
    getObjectFromGUID("365c78").setRotationSmooth({0, 180, 0})
    Wait.frames(function()
      getObjectFromGUID("365c78").setLock(true)
    end, 60)
    --Tech Negotiation
    getObjectFromGUID("ab9708").setPositionSmooth({16.26, 1.11, 14.86},false,true)
    getObjectFromGUID("ab9708").setRotationSmooth({0, 180, 0})
    Wait.frames(function()
      getObjectFromGUID("ab9708").setLock(true)
    end, 60)
    --Dreadnought
    getObjectFromGUID("051382").setPositionSmooth({15.84, 1.11, 12.21},false,true)
    getObjectFromGUID("051382").setRotationSmooth({0, 180, 0})
    Wait.frames(function()
      getObjectFromGUID("051382").setLock(true)
    end, 60)
    --Council Bonus Tokens
    getObjectFromGUID("f63f4b").setPositionSmooth({-1.43, 1.28, 13.68},false,true)
    getObjectFromGUID("f63f4b").setRotationSmooth({0, 180, 0})
    getObjectFromGUID("c2fa1c").setPositionSmooth({-0.59, 1.28, 13.68},false,true)
    getObjectFromGUID("c2fa1c").setRotationSmooth({0, 180, 0})
    getObjectFromGUID("109802").setPositionSmooth({1.30, 1.28, 13.68},false,true)
    getObjectFromGUID("109802").setRotationSmooth({0, 180, 0})
    getObjectFromGUID("3f0c1a").setPositionSmooth({2.14, 1.28, 13.68},false,true)
    getObjectFromGUID("3f0c1a").setRotationSmooth({0, 180, 0})
    --Mentat Token
    getObjectFromGUID("e7e9b1").setPositionSmooth({-0.78, 1.18, 11.17},false,true)
    getObjectFromGUID("e7e9b1").setRotationSmooth({0, 0, 0})
    destroyObject(getObjectFromGUID("0227ac"))
    destroyObject(getObjectFromGUID("3d8ded"))
    destroyObject(getObjectFromGUID("3d34e0"))
    destroyObject(getObjectFromGUID("278d1b"))
    destroyObject(getObjectFromGUID("bceb8c"))
    destroyObject(getObjectFromGUID("9375b7"))
    destroyObject(getObjectFromGUID("410533"))
  elseif getObjectFromGUID(firstPlayerToken).getVar("riseIX") == 0 then
    --High Council
    getObjectFromGUID("3d34e0").setPositionSmooth({-2.19, 1.11, 14.95},false,true)
    getObjectFromGUID("3d34e0").setRotationSmooth({0, 180, 0})
    Wait.frames(function()
      getObjectFromGUID("3d34e0").setLock(true)
    end, 60)
    --Mentat
    getObjectFromGUID("3d8ded").setPositionSmooth({-2.78, 1.11, 12.82},false,true)
    getObjectFromGUID("3d8ded").setRotationSmooth({0, 180, 0})
    Wait.frames(function()
      getObjectFromGUID("3d8ded").setLock(true)
    end, 60)
    --Rally Troops
    getObjectFromGUID("0227ac").setPositionSmooth({2.20, 1.11, 12.78},false,true)
    getObjectFromGUID("0227ac").setRotationSmooth({0, 180, 0})
    Wait.frames(function()
      getObjectFromGUID("0227ac").setLock(true)
    end, 60)
    --Swordmaster
    getObjectFromGUID("278d1b").setPositionSmooth({5.76, 1.11, 12.82},false,true)
    getObjectFromGUID("278d1b").setRotationSmooth({0, 180, 0})
    Wait.frames(function()
      getObjectFromGUID("278d1b").setLock(true)
    end, 60)
    --Hall of Oratory
    getObjectFromGUID("bceb8c").setPositionSmooth({6.07, 1.11, 14.95},false,true)
    getObjectFromGUID("bceb8c").setRotationSmooth({0, 180, 0})
    Wait.frames(function()
      getObjectFromGUID("bceb8c").setLock(true)
    end, 60)
    --Secure Contract
    getObjectFromGUID("9375b7").setPositionSmooth({10.27, 1.11, 12.82},false,true)
    getObjectFromGUID("9375b7").setRotationSmooth({0, 180, 0})
    Wait.frames(function()
      getObjectFromGUID("9375b7").setLock(true)
    end, 60)
    --Sell Melange
    getObjectFromGUID("410533").setPositionSmooth({9.84, 1.11, 14.93},false,true)
    getObjectFromGUID("410533").setRotationSmooth({0, 180, 0})
    Wait.frames(function()
      getObjectFromGUID("410533").setLock(true)
    end, 60)
    --Council Bonus Tokens
    getObjectFromGUID("f63f4b").setPositionSmooth({-1.47, 1.21, 14.08},false,true)
    getObjectFromGUID("f63f4b").setRotationSmooth({0, 180, 0})
    getObjectFromGUID("c2fa1c").setPositionSmooth({-0.64, 1.21, 14.08},false,true)
    getObjectFromGUID("c2fa1c").setRotationSmooth({0, 180, 0})
    getObjectFromGUID("109802").setPositionSmooth({1.21, 1.21, 14.08},false,true)
    getObjectFromGUID("109802").setRotationSmooth({0, 180, 0})
    getObjectFromGUID("3f0c1a").setPositionSmooth({2.01, 1.21, 14.08},false,true)
    getObjectFromGUID("3f0c1a").setRotationSmooth({0, 180, 0})
    --Mentat Token
    getObjectFromGUID("e7e9b1").setPositionSmooth({-0.84, 1.11, 11.74},false,true)
    getObjectFromGUID("e7e9b1").setRotationSmooth({0, 0, 0})
    destroyObject(getObjectFromGUID("10f379"))
    destroyObject(getObjectFromGUID("7ede9b"))
    destroyObject(getObjectFromGUID("66196a"))
    destroyObject(getObjectFromGUID("219ead"))
    destroyObject(getObjectFromGUID("365c78"))
    destroyObject(getObjectFromGUID("ab9708"))
    destroyObject(getObjectFromGUID("051382"))
  end

  --The Great Flat
  getObjectFromGUID("17aa61").setPositionSmooth({-2.47, 1.08, 1.20},false,true)
  getObjectFromGUID("17aa61").setRotationSmooth({0, 180, 0})
  Wait.frames(function()
    getObjectFromGUID("17aa61").setLock(true)
  end, 60)

  --Hagga Basin
  getObjectFromGUID("312109").setPositionSmooth({3.67, 1.08, 4.04},false,true)
  getObjectFromGUID("312109").setRotationSmooth({0, 180, 0})
  Wait.frames(function()
    getObjectFromGUID("312109").setLock(true)
  end, 60)

  --Imperial Basin
  getObjectFromGUID("ca20ba").setPositionSmooth({8.76, 1.08, 5.55},false,true)
  getObjectFromGUID("ca20ba").setRotationSmooth({0, 180, 0})
  Wait.frames(function()
    getObjectFromGUID("ca20ba").setLock(true)
  end, 60)

  --Sietch Tabr
  getObjectFromGUID("ea0cff").setPositionSmooth({-1.85, 1.08, 3.94},false,true)
  getObjectFromGUID("ea0cff").setRotationSmooth({0, 180, 0})
  Wait.frames(function()
    getObjectFromGUID("ea0cff").setLock(true)
  end, 60)

  --Research Station
  getObjectFromGUID("2a9190").setPositionSmooth({1.09, 1.08, 6.40},false,true)
  getObjectFromGUID("2a9190").setRotationSmooth({0, 180, 0})
  Wait.frames(function()
    getObjectFromGUID("2a9190").setLock(true)
  end, 60)

  --Carthag
  getObjectFromGUID("1fb1b0").setPositionSmooth({4.19, 1.08, 8.52},false,true)
  getObjectFromGUID("1fb1b0").setRotationSmooth({0, 180, 0})
  Wait.frames(function()
    getObjectFromGUID("1fb1b0").setLock(true)
  end, 60)

  --Arrakeen
  getObjectFromGUID("438a60").setPositionSmooth({8.69, 1.08, 9.37},false,true)
  getObjectFromGUID("438a60").setRotationSmooth({0, 180, 0})
  Wait.frames(function()
    getObjectFromGUID("438a60").setLock(true)
  end, 60)

  --Conspire
  getObjectFromGUID("45df71").setPositionSmooth({-7.21, 1.08, 14.10},false,true)
  getObjectFromGUID("45df71").setRotationSmooth({0, 180, 0})
  Wait.frames(function()
    getObjectFromGUID("45df71").setLock(true)
  end, 60)

  --Wealth
  getObjectFromGUID("70d8e5").setPositionSmooth({-7.38, 1.08, 11.59},false,true)
  getObjectFromGUID("70d8e5").setRotationSmooth({0, 180, 0})
  Wait.frames(function()
    getObjectFromGUID("70d8e5").setLock(true)
  end, 60)

  --Heighliner
  getObjectFromGUID("c16d62").setPositionSmooth({-7.06, 1.08, 7.98},false,true)
  getObjectFromGUID("c16d62").setRotationSmooth({0, 180, 0})
  Wait.frames(function()
    getObjectFromGUID("c16d62").setLock(true)
  end, 60)

  --Foldspace
  getObjectFromGUID("bddd6a").setPositionSmooth({-7.08, 1.08, 5.48},false,true)
  getObjectFromGUID("bddd6a").setRotationSmooth({0, 180, 0})
  Wait.frames(function()
    getObjectFromGUID("bddd6a").setLock(true)
  end, 60)

  --Selective Breeding
  getObjectFromGUID("aab325").setPositionSmooth({-6.17, 1.08, 1.91},false,true)
  getObjectFromGUID("aab325").setRotationSmooth({0, 180, 0})
  Wait.frames(function()
    getObjectFromGUID("aab325").setLock(true)
  end, 60)

  --Secrets
  getObjectFromGUID("734fac").setPositionSmooth({-7.38, 1.08, -0.63},false,true)
  getObjectFromGUID("734fac").setRotationSmooth({0, 180, 0})
  Wait.frames(function()
    getObjectFromGUID("734fac").setLock(true)
  end, 60)

  --Hardy Warriors
  getObjectFromGUID("355820").setPositionSmooth({-6.45, 1.08, -4.21},false,true)
  getObjectFromGUID("355820").setRotationSmooth({0, 180, 0})
  Wait.frames(function()
    getObjectFromGUID("355820").setLock(true)
  end, 60)

  --Stillsuits
  getObjectFromGUID("5d0684").setPositionSmooth({-7.17, 1.08, -6.72},false,true)
  getObjectFromGUID("5d0684").setRotationSmooth({0, 180, 0})
  Wait.frames(function()
    getObjectFromGUID("5d0684").setLock(true)
  end, 60)

end

function startGOM()
  	if isHotseat() then
		    --Disable Gather O Mat
        UI.show('gatherOmat')
        UI.show('GOMtip')
        uiGOM()
  	else
		    if isAllValidSeated() then
      			UI.show('gatherOmat')
      			UI.show('GOMtip')
      			uiGOM()
    		end
  	end
end

function onPlayerChangeColor(color)
    uiGOM()
end

function gatherOmatOFF()
    UI.hide("gatherOmat")
    UI.show("minigatherOmat")
end

function gatherOmatON()
    UI.show("gatherOmat")
    UI.hide("minigatherOmat")
end

function hideGOMtip()
    UI.hide("GOMtip")
end

function uiGOM()
  colors = {}
  local sequence = {}

  for i=1,4 do
    if rivals[i] == 1 or playSeat[i] == 1 then
      sequence[i] = 1
    else
      sequence[i] = 0
    end
  end

  for i=1,4 do
    if sequence[i] == 1 then
      table.insert(colors, defaultColorList[i])
    end
  end

	player_width = #colors*40
  total_width = player_width
  total_height = #resources*40 + 15
  offset = 0

  if #colors == 1 then
    offset = 20
  end

  UI.setAttribute('gatherOmat', 'width', total_width)
  UI.setAttribute('minigatherOmat', 'width', total_width)
  UI.setAttribute('minigatherOmat_btn', 'width', total_width)
  UI.setAttribute('GOMButton', 'width', total_width)
  UI.setAttribute('gatherOmat', 'height', total_height)
  UI.setAttribute('ItemAnnounce4', 'offsetXY', '-20 '..(total_height+30))
  UI.setAttribute('ItemAnnounce3', 'offsetXY', '-20 '..(total_height+60))
  UI.setAttribute('ItemAnnounce2', 'offsetXY', '-20 '..(total_height+90))
  UI.setAttribute('ItemAnnounce1', 'offsetXY', '-20 '..(total_height+120))
  UI.setAttribute('GOMhead', 'offsetXY', "0 "..((total_height-15)/2 + 1))
  UI.setAttribute('GOMtip', 'offsetXY', -total_width..' 0')

  for idx = 1,4 do
    item = resources[idx]
      if item == nil then
        UI.setAttribute('GOM'..idx, 'active', false)
      else
        UI.setAttribute('spawn'..idx, 'width', total_width)
        UI.setAttribute('spawn'..idx, 'item', item)
        count = 0
        for ii, color in ipairs(ALL_COLORS) do
          if getIndex(color, colors) ~= nil then
            UI.setAttribute(color..item, 'active', true)
            UI.setAttribute(color..item, 'offsetXY', (count/#colors*player_width).." 0")
            UI.setAttribute(color..item, 'width', player_width/#colors)
            count = count + 1
          else
            UI.setAttribute(color..item, 'active', false)
end end end end end

function getIndex(obj, tbl)
  for ii, item in ipairs(tbl) do
    if obj == item then
      return ii
end end end

function containsIt(table, val)
   for i=1,#table do
      if table[i] == val then
         return true
      end
   end
   return false
end

function isHotseat()
 for i,player in ipairs(Player.getPlayers()) do
   if not string.match(player.steam_name,"Player") then
     return false
   end
 end
 return true
end

function isAllValidSeated()
  	local colorsSeated = getSeatedPlayers()
	  local allValid = true
	  local obSetup = getObjectFromGUID(SetupID)
	  for i,v in ipairs(colorsSeated) do
     if containsIt(VALID_COLORS,v) then
     else
       allValid = false
     end
   end

 return allValid
end

function spawnitem(player, value, id)
  local boards = {"a0fa97", "042887", "e435ab", "f8a49f"}
  if value == "-1" then
    if id == "spawnSolarisRed" then
      getObjectFromGUID(boards[1]).call("takeOneSolaris",{})
    elseif id == "spawnSolarisBlue" then
      getObjectFromGUID(boards[2]).call("takeOneSolaris",{})
    elseif id == "spawnSolarisOrange" then
      getObjectFromGUID(boards[3]).call("takeOneSolaris",{})
    elseif id == "spawnSolarisGreen" then
      getObjectFromGUID(boards[4]).call("takeOneSolaris",{})
    elseif id == "spawnWaterRed" then
      getObjectFromGUID(boards[1]).call("takeWater",{})
    elseif id == "spawnWaterBlue" then
      getObjectFromGUID(boards[2]).call("takeWater",{})
    elseif id == "spawnWaterOrange" then
      getObjectFromGUID(boards[3]).call("takeWater",{})
    elseif id == "spawnWaterGreen" then
      getObjectFromGUID(boards[4]).call("takeWater",{})
    elseif id == "spawnSpiceRed" then
      getObjectFromGUID(boards[1]).call("takeOneSpice",{})
    elseif id == "spawnSpiceBlue" then
      getObjectFromGUID(boards[2]).call("takeOneSpice",{})
    elseif id == "spawnSpiceOrange" then
      getObjectFromGUID(boards[3]).call("takeOneSpice",{})
    elseif id == "spawnSpiceGreen" then
      getObjectFromGUID(boards[4]).call("takeOneSpice",{})
    elseif id == "spawnIntrigueRed" and rivals[1] == 1 then
      getObjectFromGUID(boards[1]).call("drawIntrigue",{})
    elseif id == "spawnIntrigueBlue" and rivals[2] == 1 then
      getObjectFromGUID(boards[2]).call("drawIntrigue",{})
    elseif id == "spawnIntrigueOrange" and rivals[3] == 1 then
      getObjectFromGUID(boards[3]).call("drawIntrigue",{})
    elseif id == "spawnIntrigueGreen" and rivals[4] == 1 then
      getObjectFromGUID(boards[4]).call("drawIntrigue",{})
    elseif id == "spawnIntrigueRed" and rivals[1] != 1 then
      params = {"Red"}
      getObjectFromGUID("7962b9").call("intrigueBoardDraw",{params})
    elseif id == "spawnIntrigueBlue" and rivals[2] != 1 then
      params = {"Blue"}
      getObjectFromGUID("7962b9").call("intrigueBoardDraw",{params})
    elseif id == "spawnIntrigueOrange" and rivals[3] != 1 then
      params = {"Orange"}
      getObjectFromGUID("7962b9").call("intrigueBoardDraw",{params})
    elseif id == "spawnIntrigueGreen" and rivals[4] != 1 then
      params = {"Green"}
      getObjectFromGUID("7962b9").call("intrigueBoardDraw",{params})
    end
  elseif value == "-2" then
    if id == "spawnSolarisRed" then
      getObjectFromGUID(boards[1]).call("spendOneSolaris",{})
    elseif id == "spawnSolarisBlue" then
      getObjectFromGUID(boards[2]).call("spendOneSolaris",{})
    elseif id == "spawnSolarisOrange" then
      getObjectFromGUID(boards[3]).call("spendOneSolaris",{})
    elseif id == "spawnSolarisGreen" then
      getObjectFromGUID(boards[4]).call("spendOneSolaris",{})
    elseif id == "spawnWaterRed" then
      getObjectFromGUID(boards[1]).call("spendWater",{})
    elseif id == "spawnWaterBlue" then
      getObjectFromGUID(boards[2]).call("spendWater",{})
    elseif id == "spawnWaterOrange" then
      getObjectFromGUID(boards[3]).call("spendWater",{})
    elseif id == "spawnWaterGreen" then
      getObjectFromGUID(boards[4]).call("spendWater",{})
    elseif id == "spawnSpiceRed" then
      getObjectFromGUID(boards[1]).call("spendOneSpice",{})
    elseif id == "spawnSpiceBlue" then
      getObjectFromGUID(boards[2]).call("spendOneSpice",{})
    elseif id == "spawnSpiceOrange" then
      getObjectFromGUID(boards[3]).call("spendOneSpice",{})
    elseif id == "spawnSpiceGreen" then
      getObjectFromGUID(boards[4]).call("spendOneSpice",{})
    elseif id == "spawnIntrigueRed" and rivals[1] == 1 then
      getObjectFromGUID(boards[1]).call("discardIntrigueRival",{})
    elseif id == "spawnIntrigueBlue" and rivals[2] == 1 then
      getObjectFromGUID(boards[2]).call("discardIntrigueRival",{})
    elseif id == "spawnIntrigueOrange" and rivals[3] == 1 then
      getObjectFromGUID(boards[3]).call("discardIntrigueRival",{})
    elseif id == "spawnIntrigueGreen" and rivals[4] == 1 then
      getObjectFromGUID(boards[4]).call("discardIntrigueRival",{})
    elseif id == "spawnIntrigueRed" and rivals[1] != 1 then
      params = {"Red"}
      getObjectFromGUID("a0fa97").call("discardIntrigue",{})
    elseif id == "spawnIntrigueBlue" and rivals[2] != 1 then
      params = {"Blue"}
      getObjectFromGUID("042887").call("discardIntrigue",{})
    elseif id == "spawnIntrigueOrange" and rivals[3] != 1 then
      params = {"Orange"}
      getObjectFromGUID("e435ab").call("discardIntrigue",{})
    elseif id == "spawnIntrigueGreen" and rivals[4] != 1 then
      params = {"Green"}
      getObjectFromGUID("f8a49f").call("discardIntrigue",{})
    end
  end

end