
-- ===== 5 Solaris 3f6168 (2229 chars) =====
buttonRed = 0
buttonGreen = 0
buttonBlue = 0

bowlRef = {"85ebad", "235331", "04d59b", "917162"}
bowlPos = {}

function bagLabel()
  buttonRed = 128
  buttonGreen = 128
  buttonBlue = 128

  buttonRed = buttonRed/255
  buttonGreen = buttonGreen/255
  buttonBlue = buttonBlue/255

  self.createButton({
    label="Take 5 Solaris", click_function="takeSolaris", function_owner=self,
    position={2.15,0.25,0.0}, rotation = {0,180,0}, height=250, width=850, font_size=125, font_color={1,1,1}, color={buttonRed, buttonGreen, buttonBlue}
  })
  self.createButton({
    label="Take 5 Solaris", click_function="takeSolaris", function_owner=self,
    position={-2.15,0.25,0.0}, rotation = {0,180,0}, height=250, width=850, font_size=125, font_color={1,1,1}, color={buttonRed, buttonGreen, buttonBlue}
  })
end

function takeSolaris(GO, color)

  for i=1,4 do
    bowlPos[i] = getObjectFromGUID(bowlRef[i]).getPosition()
    bowlPos[i].x = bowlPos[i].x + math.random()/3
    bowlPos[i].y = 4
    bowlPos[i].z = bowlPos[i].z + math.random()/3
  end

  if color == "Red" then
    solarisPos = bowlPos[1]
    tokenRot = {0,180,0}
  elseif color == "Blue" then
    solarisPos = bowlPos[2]
    tokenRot = {0,180,0}
  elseif color == "Orange" then
    solarisPos = bowlPos[3]
    tokenRot = {0,180,0}
  elseif color == "Green" then
    solarisPos = bowlPos[4]
    tokenRot = {0,180,0}
  end

  self.takeObject({position = solarisPos, rotation = tokenRot})
end

function takeBoardSolaris(color)

  for i=1,4 do
    bowlPos[i] = getObjectFromGUID(bowlRef[i]).getPosition()
    bowlPos[i].x = bowlPos[i].x + math.random()/3
    bowlPos[i].y = 4
    bowlPos[i].z = bowlPos[i].z + math.random()/3
  end

  if color[1][1] == "Red" then
    solarisPos = bowlPos[1]
    tokenRot = {0,180,0}
  elseif color[1][1] == "Blue" then
    solarisPos = bowlPos[2]
    tokenRot = {0,180,0}
  elseif color[1][1] == "Orange" then
    solarisPos = bowlPos[3]
    tokenRot = {0,180,0}
  elseif color[1][1] == "Green" then
    solarisPos = bowlPos[4]
    tokenRot = {0,180,0}
  end

  self.takeObject({position = solarisPos, rotation = tokenRot})
end

function clearLabel()
  self.clearButtons()
end

-- ===== 5 Spice 3d38e5 (1520 chars) =====
buttonRed = 0
buttonGreen = 0
buttonBlue = 0

bowlRef = {"8655b7", "9a6fc5", "1d6251", "6fae7e"}
bowlPos = {}

function bagLabel()
  buttonRed = 255
  buttonGreen = 084
  buttonBlue = 0

  buttonRed = buttonRed/255
  buttonGreen = buttonGreen/255
  buttonBlue = buttonBlue/255

  self.createButton({
    label="Take 5 Spice", click_function="takeSpice", function_owner=self,
    position={-2.15,0.25,0.0}, rotation = {0,180,0}, height=250, width=850, font_size=125, font_color={1,1,1}, color={buttonRed, buttonGreen, buttonBlue}
  })  
  self.createButton({
    label="Take 5 Spice", click_function="takeSpice", function_owner=self,
    position={2.15,0.25,0.0}, rotation = {0,180,0}, height=250, width=850, font_size=125, font_color={1,1,1}, color={buttonRed, buttonGreen, buttonBlue}
  })  
end

function takeSpice(GO, color)

  for i=1,4 do
    bowlPos[i] = getObjectFromGUID(bowlRef[i]).getPosition()
    bowlPos[i].x = bowlPos[i].x + math.random()/3
    bowlPos[i].y = 4
    bowlPos[i].z = bowlPos[i].z + math.random()/3
  end

  if color == "Red" then
    spicePos = bowlPos[1]
    tokenRot = {0,180,0}
  elseif color == "Blue" then
    spicePos = bowlPos[2]
    tokenRot = {0,180,0}
  elseif color == "Orange" then
    spicePos = bowlPos[3]
    tokenRot = {0,180,0}
  elseif color == "Green" then
    spicePos = bowlPos[4]
    tokenRot = {0,180,0}
  end

  self.takeObject({position = spicePos, rotation = tokenRot})
end

function clearLabel()
  self.clearButtons()
end

-- ===== Water 400db5 (1522 chars) =====
buttonRed = 0
buttonGreen = 0
buttonBlue = 0

bowlRef = {"ff8960", "985873", "8b211a", "2a5d7c"}
bowlPos = {}

function bagLabel()
  buttonRed = 0
  buttonGreen = 153
  buttonBlue = 255

  buttonRed = buttonRed/255
  buttonGreen = buttonGreen/255
  buttonBlue = buttonBlue/255

  self.createButton({
    label="Take 1 Water", click_function="takeWater", function_owner=self,
    position={2.15,0.25,0.0}, rotation = {0,180,0}, height=250, width=750, font_size=125, font_color={1,1,1}, color={buttonRed, buttonGreen, buttonBlue}
  })  
  self.createButton({
    label="Take 1 Water", click_function="takeWater", function_owner=self,
    position={-2.15,0.25,0.0}, rotation = {0,180,0}, height=250, width=750, font_size=125, font_color={1,1,1}, color={buttonRed, buttonGreen, buttonBlue}
  })  
end

function takeWater(GO, color)

  for i=1,4 do
    bowlPos[i] = getObjectFromGUID(bowlRef[i]).getPosition()
    bowlPos[i].x = bowlPos[i].x + math.random()/3
    bowlPos[i].y = 4
    bowlPos[i].z = bowlPos[i].z + math.random()/3
  end

  if color == "Red" then
    waterPos = bowlPos[1]
    tokenRot = {0,180,0}
  elseif color == "Blue" then
    waterPos = bowlPos[2]
    tokenRot = {0,180,0}
  elseif color == "Orange" then
    waterPos = bowlPos[3]
    tokenRot = {0,180,0}
  elseif color == "Green" then
    waterPos = bowlPos[4]
    tokenRot = {0,180,0}
  end

  self.takeObject({position = waterPos, rotation = tokenRot})
end

function clearLabel()
  self.clearButtons()
end

-- ===== House Hagal (1p and 2p mode) aaec7d (5268 chars) =====
churnCheck = 1

function onLoad()
  buttonRed = 40
  buttonGreen = 90
  buttonBlue = 120

  buttonRed = buttonRed/255
  buttonGreen = buttonGreen/255
  buttonBlue = buttonBlue/255

  self.clearButtons()
  if getObjectFromGUID("784534").getVar("inProgress") == 0 then
    self.createButton ({
      ['click_function'] = 'setChurn',
      ['label'] = '[x] Include "Churn" Cards',
      ['function_owner'] = self,
      ['position'] = {0.00, 0.7, 1.95},
      ['rotation'] =  {0, 0, 0},
      ['scale'] = {0.7, 0.7, 0.7},
      ['width'] = 3750,
      ['height'] = 500,
      ['font_size'] = 300,
      ['color'] = {buttonRed, buttonGreen, buttonBlue},
      ['font_color'] = "White"
    })
  end
end

function setChurn()
  if churnCheck == 0 then
    churnCheck = 1
    buttons = self.getButtons()
    local labelCheck = '[ ] Include "Churn" Cards'
    if buttons != nil then
      for i, v in pairs(buttons) do
        if v.label == labelCheck then
          buttonIndex = i-1
        end
      end
    end
    local labelUpdate = '[x] Include "Churn" Cards'
    self.editButton({index=buttonIndex, label=labelUpdate})
  elseif churnCheck == 1 then
    churnCheck = 0
    buttons = self.getButtons()
    local labelCheck = '[x] Include "Churn" Cards'
    if buttons != nil then
      for i, v in pairs(buttons) do
        if v.label == labelCheck then
          buttonIndex = i-1
        end
      end
    end
    local labelUpdate = '[ ] Include "Churn" Cards'
    self.editButton({index=buttonIndex, label=labelUpdate})
  end
end

function getCard(nameT)
  return cardLib[nameT[1]]
end

cardLib = {
["Heighliner"] = {Type = "Hagal", Emperor = false, Guild = true, Bene = false, Fremen = false, Harvest = false, Combat = true, Troops = 3, Dread = 0},
["Foldspace"] = {Type = "Hagal", Emperor = false, Guild = true, Bene = false, Fremen = false, Harvest = false, Combat = false, Troops = 0, Dread = 0},

["Carthag"] = {Type = "Hagal", Emperor = false, Guild = false, Bene = false, Fremen = false, Harvest = false, Combat = true, Troops = 1, Dread = 0},
["Carthag R"] = {Type = "Hagal", Emperor = false, Guild = false, Bene = false, Fremen = false, Harvest = false, Combat = true, Troops = 1, Dread = 0},
["Carthag L"] = {Type = "Hagal", Emperor = false, Guild = false, Bene = false, Fremen = false, Harvest = false, Combat = true, Troops = 1, Dread = 0},
["Carthag W"] = {Type = "Hagal", Emperor = false, Guild = false, Bene = false, Fremen = false, Harvest = false, Combat = true, Troops = 1, Dread = 0},

["Research Station"] = {Type = "Hagal", Emperor = false, Guild = false, Bene = false, Fremen = false, Harvest = false, Combat = true, Troops = 0, Dread = 0},

["Harvest Spice"] = {Type = "Hagal", Emperor = false, Guild = false, Bene = false, Fremen = false, Harvest = true, Combat = true, Troops = 0, Dread = 0},

["Secrets"] = {Type = "Hagal", Emperor = false, Guild = false, Bene = true, Fremen = false, Harvest = false, Combat = false, Troops = 0, Dread = 0},
["Selective Breeding"] = {Type = "Hagal", Emperor = false, Guild = false, Bene = true, Fremen = false, Harvest = false, Combat = false, Troops = 0, Dread = 0},

["Wealth"] = {Type = "Hagal", Emperor = true, Guild = false, Bene = false, Fremen = false, Harvest = false, Combat = false, Troops = 0, Dread = 0},
["Conspire"] = {Type = "Hagal", Emperor = true, Guild = false, Bene = false, Fremen = false, Harvest = false, Combat = false, Troops = 2, Dread = 0},

["Hardy Warriors"] = {Type = "Hagal", Emperor = false, Guild = false, Bene = false, Fremen = true, Harvest = false, Combat = true, Troops = 2, Dread = 0},
["Stillsuits"] = {Type = "Hagal", Emperor = false, Guild = false, Bene = false, Fremen = true, Harvest = false, Combat = true, Troops = 0}, Dread = 0,

["Arrakeen"] = {Type = "Hagal", Emperor = false, Guild = false, Bene = false, Fremen = false, Harvest = false, Combat = true, Troops = 1, Dread = 0},

["Hall of Oratory"] = {Type = "Hagal", Emperor = false, Guild = false, Bene = false, Fremen = false, Harvest = false, Combat = false, Troops = 1, Dread = 0},
["Rally Troops"] = {Type = "Hagal", Emperor = false, Guild = false, Bene = false, Fremen = false, Harvest = false, Combat = false, Troops = 4, Dread = 0},

["Dreadnought 1P"] = {Type = "Hagal", Emperor = false, Guild = false, Bene = false, Fremen = false, Harvest = false, Combat = false, Troops = 0, Dread = 1},
["Dreadnought"] = {Type = "Hagal", Emperor = false, Guild = false, Bene = false, Fremen = false, Harvest = false, Combat = false, Troops = 1, Dread = 1},
["Tech Negotiation"] = {Type = "Hagal", Emperor = false, Guild = false, Bene = false, Fremen = false, Harvest = false, Combat = false, Troops = 0, Dread = 0},
["Interstellar Shipping"] = {Type = "Hagal", Emperor = false, Guild = false, Bene = false, Fremen = false, Harvest = false, Combat = false, Troops = 0, Dread = 0},
["Foldspace or Interstellar"] = {Type = "Hagal", Emperor = false, Guild = false, Bene = false, Fremen = false, Harvest = false, Combat = false, Troops = 0, Dread = 0},
["Smuggling or Interstellar"] = {Type = "Hagal", Emperor = false, Guild = false, Bene = false, Fremen = false, Harvest = false, Combat = false, Troops = 0, Dread = 0},
}

-- ===== Custom_Tile f1a7d1 (52609 chars) =====
hagalDraw = {"019932", "922c70", "5fbaf4", "cef5cb"}
hagalDiscard = {"c27bfc", "899024", "86177c", "9a3af6"}
hagalLocations = {
  ["Stillsuits"]={zone = "24973a", location = {-7.73, 2, -7.90}},
  ["Hardy Warriors"]={zone = "2ec4da", location = {-7.73, 2, -5.28}},
  ["Secrets"]={zone = "545477", location = {-7.73, 2, -1.75}},
  ["Selective Breeding"]={zone = "90c61c", location = {-7.73, 2, 0.89}},
  ["Foldspace"]={zone = "57c221", location = {-7.73, 2, 4.39}},
  ["Heighliner"]={zone = "c879a0", location = {-7.72, 2, 6.92}},
  ["Wealth"]={zone = "de7762", location = {-7.72, 2, 10.60}},
  ["Conspire"]={zone = "d526ea", location = {-7.72, 2, 13.16}},
  ["Rally Troops"]={zone = "84b048", location = {1.16, 2, 11.93}},
  ["Hall of Oratory"]={zone = "7b1013", location = {4.79, 2, 14.06}},
  ["Carthag"]={zone = "3766cc", location = {3.73, 2, 7.56}},
  ["Harvest Spice"]={zone = {"a8f11b", "2cb52b", "139415"}, location = {{-3.62, 2, 0.17}, {2.91, 2, 3.04}, {7.64, 2, 4.50}}},
  ["Arrakeen"]={zone = "7872cc", location = {7.96, 2, 8.36}},
  ["Reshuffle"] = {zone = "", location = {}},
  ["Dreadnought 1P"] = {zone = "cfb1c9", location = {14.90, 2, 11.13}},
  ["Dreadnought"] = {zone = "cfb1c9", location = {14.90, 2, 11.13}},
  ["Tech Negotiation"] = {zone = "64f5b6", location = {14.91, 2, 13.64}},
  ["Interstellar Shipping"] = {zone = "7b1013", location = {5.59, 2, 13.50}},
  ["Foldspace or Interstellar"] = {zone = "57c221", location = {-7.73, 2, 4.39}},
  ["Smuggling or Interstellar"] = {zone = "9c5484", location = {5.60, 2, 11.27}},
  ["Research Station"] = {zone = "060b9a", location ={-0.37, 2, 5.38}},
  ["Carthag R"]={zone = "3766cc", location = {3.73, 2, 7.56}},
  ["Carthag L"]={zone = "3766cc", location = {3.73, 2, 7.56}},
  ["Carthag W"]={zone = "3766cc", location = {3.73, 2, 7.56}},
}

redAgents = {"7751c8", "afa978", "ed3490"}
blueAgents = {"106d8b", "64d013", "a78ad7"}
orangeAgents = {"72a073", "fbe4b4", "7549d5"}
greenAgents = {"bceb0e", "66ae45", "fb1629"}

boardZone = {"bd39f6", "9b4f33", "bd5bf6", "231215"}
playerBoard = {"a0fa97", "042887", "e435ab", "f8a49f"}
tileOffset = {-4.50, -1.50, 1.50, 4.50}

firstPlayerToken = "784534"

imperiumDeckZone = "ad3c5a"
imperiumRow = {"b17148", "a4f598", "2f3821", "52cc32", "85a5fe"}
trashBin = "288283"

spiceZones = {"7a4151", "b379ba", "1cc416"}
spiceBowls = {"8655b7", "9a6fc5", "1d6251", "6fae7e"}
harvestCheck= 0

--Fremen, Bene, Spacing and Emperor
influenceZones = {"799d77", "0de027", "4a0d84", "75ce34"}

currentRival = 0
nextRival = 0
saveRivalStart = 0
rivalColor = 0
rivalAgent = ""
defaultColorList = {"Red", "Blue", "Orange", "Green"}
rivalProgress = 0
turnOrder = {}
autoCheck = 1
playerSpot = 0

oneSpiceBag = "85289a"

expertTroop = 0

vpIncrease = {"upRed", "upBlue", "upOrange", "upGreen"}

freighterTokens = {"baab6a", "a79dae", "b4843b", "2c5541"}
freighterLocationsTierZero = {{8.55, 1.5, 10.70}, {9.25, 1.5, 10.70}, {9.95, 1.5, 10.70}, {10.65, 1.5, 10.70}}
freighterLocationsTierOne = {{8.55, 1.5, 11.86}, {9.25, 1.5, 11.86}, {9.95, 1.5, 11.86}, {10.65, 1.5, 11.86}}
freighterLocationsTierTwo = {{8.55, 1.5, 13.19}, {9.25, 1.5, 13.19}, {9.95, 1.5, 13.19}, {10.65, 1.5, 13.19}}
freighterLocationsTierThree = {{8.55, 1.5, 14.56}, {9.25, 1.5, 14.56}, {9.95, 1.5, 14.56}, {10.65, 1.5, 14.56}}
techZones = {"b9349c", "b42a9c", "9c3da8"}
ixBag = "6b4579"

techTilePrice = 0

redSupply = {-49.00, 3.5, -22.00}
blueSupply = {-6.00, 3.5, -22.00}
orangeSupply = {6.00, 3.5, -22.00}
greenSupply = {49.00, 3.5, -22.00}

--currentPlayerHagal = {}
--rivalsHagal = {}

hagalBag = "aaec7d"

--Immortality Expansion (Deck, Left and Right)
researchCardZones = {"f8befb", "7954ec", "fb42f0"}

function onSave()
  local saved_data_hagal = {}
  local data_to_save_hagal = {}
  local cr = currentRival
  local nr = nextRival
  local srs = saveRivalStart
  local rc = rivalColor
  if rivalAgent != "" and rivalAgent != nil then
    local ra = rivalAgent.getGUID()
  else
    local ra = ""
  end
  local rps = rivalProgress
  local tuo = turnOrder
  local atc = autoCheck
  local ps = playerSpot

  data_to_save_hagal = {cr, nr, srs, rc, ra, rps, tuo, atc, ps}

  saved_data_hagal = JSON.encode(data_to_save_hagal)

  return saved_data_hagal
end

function onLoad(saved_data_hagal)
  if saved_data_hagal ~= "" and saved_data_hagal ~= nil then
    local loaded_data = JSON.decode(saved_data_hagal)

    currentRival = loaded_data[1]
    nextRival = loaded_data[2]
    saveRivalStart = loaded_data[3]
    rivalColor = loaded_data[4]
    rivalAgent = getObjectFromGUID(loaded_data[5])
    rivalProgress = loaded_data[6]
    turnOrder = loaded_data[7]
    autoCheck = loaded_data[8]
    playerSpot = loaded_data[9]
    if autoCheck == nil then
      autoCheck = 1
    end
  else

    currentRival = 0
    nextRival = 0
    saveRivalStart = 0
    rivalColor = 0
    rivalAgent = ""
    rivalProgress = 0
    turnOrder = {}
    autoCheck = 1
  end

  buttonRed = 63
  buttonGreen = 121
  buttonBlue = 146

  buttonRed = buttonRed/255
  buttonGreen = buttonGreen/255
  buttonBlue = buttonBlue/255

  self.clearButtons()
  if rivalProgress == 0 then
    self.createButton ({
      ['click_function'] = 'drawHagal',
      ['label'] = 'House Hagal',
      ['function_owner'] = self,
      ['position'] = {0.00, 0.2, 0.0},
      ['rotation'] =  {0, 0, 0},
      ['width'] = 3700,
      ['height'] = 900,
      ['font_size'] = 550,
      ['color'] = {buttonRed, buttonGreen, buttonBlue},
      ['font_color'] = "White"
    })
  elseif rivalProgress == 1 then
   self.createButton ({
    ['click_function'] = 'drawHagal',
    ['label'] = 'Draw Card',
    ['function_owner'] = self,
    ['position'] = {0.00, 0.2, 0.0},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 3700,
    ['height'] = 900,
    ['font_size'] = 550,
    ['color'] = defaultColorList[rivalColor],
    ['font_color'] = "White"
   })
  end
  if autoCheck == 0 then
  self.createButton ({
    ['click_function'] = 'setAuto',
    ['label'] = 'Auto Agent Placement [No]',
    ['function_owner'] = self,
    ['position'] = {0.00, 0.2, 2.0},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 3700,
    ['height'] = 500,
    ['font_size'] = 250,
    ['color'] = "Black",
    ['font_color'] = "White"
  })
  elseif autoCheck == 1 then
  self.createButton ({
    ['click_function'] = 'setAuto',
    ['label'] = 'Auto Agent Placement [Yes]',
    ['function_owner'] = self,
    ['position'] = {0.00, 0.2, 2.0},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 3700,
    ['height'] = 500,
    ['font_size'] = 250,
    ['color'] = "Black",
    ['font_color'] = "White"
  })
  end
end

function setAuto()
  if autoCheck == 0 then
    buttons = self.getButtons()
    if buttons != nil then
      for i, v in pairs(buttons) do
        if v.label == "Auto Agent Placement [No]" then
          buttonIndex = i-1
        end
      end
    end
    self.removeButton(buttonIndex)
    self.createButton ({
      ['click_function'] = 'setAuto',
      ['label'] = 'Auto Agent Placement [Yes]',
      ['function_owner'] = self,
      ['position'] = {0.00, 0.2, 2.0},
      ['rotation'] =  {0, 0, 0},
      ['width'] = 3700,
      ['height'] = 500,
      ['font_size'] = 250,
      ['color'] = "Black",
      ['font_color'] = "White"
    })
    autoCheck = 1
  elseif autoCheck == 1 then
    buttons = self.getButtons()
    if buttons != nil then
      for i, v in pairs(buttons) do
        if v.label == "Auto Agent Placement [Yes]" then
          buttonIndex = i-1
        end
      end
    end
    self.removeButton(buttonIndex)
    self.createButton ({
      ['click_function'] = 'setAuto',
      ['label'] = 'Auto Agent Placement [No]',
      ['function_owner'] = self,
      ['position'] = {0.00, 0.2, 2.0},
      ['rotation'] =  {0, 0, 0},
      ['width'] = 3700,
      ['height'] = 500,
      ['font_size'] = 250,
      ['color'] = "Black",
      ['font_color'] = "White"
    })
    autoCheck = 0
  end

end

function GetDeckOrCard(zoneGUID)
  for _, obj in ipairs(getObjectFromGUID(zoneGUID).getObjects()) do
    if obj.name == "Card" or obj.name == "CardCustom" or obj.name == "Deck" or obj.name == "DeckCustom" then
      return obj
    end
  end

 return nil
end

function freighterAction()
  local  freighterPos = getObjectFromGUID(freighterTokens[rivalColor]).getPosition()
  if freighterPos.z + 1.24 > 14.40 then
    freighterPos = freighterLocationsTierZero[rivalColor]
    broadcastToAll(defaultColorList[rivalColor] .. " Rival recalled their Freighter!", stringColorToRGB(defaultColorList[rivalColor]))
    --Recruit
    local waitDelay = 0
    local playerArea = getObjectFromGUID(playerBoard[rivalColor])
    for i=1, 2 do
      Wait.frames(function()
        playerArea.call("addGarrison",{})
      end, waitDelay)
      waitDelay = waitDelay + 45
    end
    --Influence Gain
    Wait.frames(function()
      broadcastToAll("Advance " .. defaultColorList[rivalColor] .. " Rival's influence marker that is the lowest", stringColorToRGB(defaultColorList[rivalColor]))
    end, 60)
    Wait.frames(function()
      broadcastToAll("If the lowest influence markers are the same, you may choose", stringColorToRGB(defaultColorList[rivalColor]))
    end, 90)
    --Dividends
    local slowDiv = 0
    for i=1, 4 do
      if i == rivalColor then
        for i=1, 5 do
          Wait.frames(function()
            getObjectFromGUID(playerBoard[rivalColor]).call("takeOneSolaris", {})
          end,slowDiv)
          slowDiv = slowDiv + 30
        end
      elseif Global.getVar("rivals")[i] == 1 or Global.getVar("playSeat")[i] == 1 then
        getObjectFromGUID(playerBoard[i]).call("takeOneSolaris", {})
      end
    end
  else
    freighterPos.z = freighterPos.z + 1.24
  end
  getObjectFromGUID(freighterTokens[rivalColor]).setPositionSmooth(freighterPos, false, true)
end

function resetRivalStart()
end

function rivalButtonUpdate(colorFirst)
  buttons = self.getButtons()
  if buttons != nil then
    for i, v in pairs(buttons) do
      if v.label == "House Hagal" then
        buttonIndex = i-1
      end
    end
  end
  self.editButton({index=buttonIndex, color=defaultColorList[colorFirst[1][1]]})
  self.editButton({index=buttonIndex, label="Draw Card"})
end

function setRival(rivalUpdate)
  local playerCheck = 0

  for i=1,2 do
    if defaultColorList[rivalUpdate[1]] == turnOrder[i] then
      currentRival = i
      playerCheck = 1
      buttons = self.getButtons()
      if buttons != nil then
        for i, v in pairs(buttons) do
          if v.label == "Player Turn" then
            buttonIndex = i-1
          end
        end
      end
      self.editButton({index=buttonIndex, label="Draw Card"})
    end
  end
  if playerCheck == 0 then
    currentRival = saveRivalStart
    buttons = self.getButtons()
    if buttons != nil then
      for i, v in pairs(buttons) do
        if v.label == "Draw Card" then
          buttonIndex = i-1
        end
      end
    end
    self.editButton({index=buttonIndex, label="Player Turn"})
    self.editButton({index=buttonIndex, color=defaultColorList[playerSpot]})
    --self.editButton({index=buttonIndex, color="Orange"})
  end
  if buttons != nil then
    for i, v in pairs(buttons) do
      if v.label == "Draw Card" then
        buttonIndex = i-1
      end
    end
  end
  if playerCheck != 0 then
    self.editButton({index=buttonIndex, color=turnOrder[currentRival]})
  end
end

function drawHagal()
  local playerPingCount = 0
  local playerCheck = Player.getPlayers()

  for _, playerPing in ipairs(playerCheck) do
    if playerPing.color == "Red" or playerPing.color == "Blue" or playerPing.color == "Orange" or playerPing.color == "Green" then
      playerPingCount = playerPingCount + 1
    end
  end

  local playerSet = Global.getVar("playSeat")
  local rivalsHagal = Global.getVar("rivals")
  local currentPlayerHagal = getObjectFromGUID("784534").getVar("initialRival")
  --local rivalSave = getObjectFromGUID("784534").getVar("savedRival")

  playerSpot = 0

  for i=1,4 do
    if playerSet[i] == 1 then
      playerSpot = i
    end
  end

  if rivalProgress == 0 then
    for i=1,4 do
      if rivalsHagal[i] == 1 then
        table.insert(turnOrder,defaultColorList[i])
      end
    end

    table.insert(turnOrder,defaultColorList[playerSpot])

    if playerPingCount == 1 then
    for i=1,4 do
      if currentPlayerHagal[i] == 1 then
        currentRival = i
        rivalColor = i
      end
    end
    elseif playerPingCount == 2 then
      for i=1,4 do
        if rivalsHagal[i] == 1 then
          currentRival = 1
          saveRivalStart = 1
          rivalColor = i
        end
      end
    end

    for i=1, 2 do
      if defaultColorList[currentRival] == turnOrder[i] then
        currentRival = i
        saveRivalStart = i
        break
      end
    end

    rivalProgress = 1
    buttons = self.getButtons()
    if buttons != nil then
      for i, v in pairs(buttons) do
        if v.label == "Draw Card" then
          buttonIndex = i-1
        end
      end
    end
    self.editButton({index=buttonIndex, color=turnOrder[currentRival]})
  end

  for i=1,4 do
    if defaultColorList[i] == turnOrder[currentRival] then
      rivalColor = i
    end
  end

  if currentRival != 3 then

  availableAgent = 0

  boardCheck = getObjectFromGUID(boardZone[rivalColor]).getObjects()

  for _, item in ipairs(boardCheck) do
    if item.getDescription() == "Agent" then
      availableAgent = 1
      rivalAgent = item
    end
  end

  expertTroopCheck()

  if availableAgent == 1 then

  for i=1,4 do
    local hagalDeck = GetDeckOrCard(hagalDraw[i])
    if hagalDeck != nil then
      hagalPos = getObjectFromGUID(hagalDiscard[i]).getPosition()
      hagalPos.y = 2
    end
    if hagalDeck != nil then
      if hagalDeck.name == "Deck" or hagalDeck.name == "DeckCustom" then
        cardDraw = hagalDeck.takeObject({position = hagalPos, flip = true})
      elseif hagalDeck.name == "Card" or hagalDeck.name == "CardCustom" then
        cardDraw = hagalDeck
        cardDraw.flip()
        cardDraw.setPositionSmooth(hagalPos)
        self.editButton({index=0,label="Reshuffle?",click_function="reshuffleDeck"})
      end
      if autoCheck == 1 then
        processDraw(cardDraw)
      end
    end
  end

  else
    broadcastToAll(turnOrder[currentRival] .. " Rival has no Agents available")
   if playerPingCount == 1 then
     if currentRival == 1 then
      currentRival = 2
     elseif currentRival == 2 then
      currentRival = 3
     elseif currentRival == 3 then
      currentRival = 1
     end
     buttons = self.getButtons()
     if buttons != nil then
       for i, v in pairs(buttons) do
         if v.label == "Draw Card" then
           buttonIndex = i-1
         end
       end
     end

     if currentRival != 3 then
      self.editButton({index=buttonIndex, color=turnOrder[currentRival]})
     else
      self.editButton({index=buttonIndex, color=turnOrder[currentRival]})
      self.editButton({index=buttonIndex, label="Player Turn"})
     end
   end
  end
 else
  currentRival = 1

   buttons = self.getButtons()
   if buttons != nil then
     for i, v in pairs(buttons) do
       if v.label == "Player Turn" then
         buttonIndex = i-1
       end
     end
   end
   self.editButton({index=buttonIndex, color=turnOrder[currentRival]})
   self.editButton({index=buttonIndex, label="Draw Card"})
 end --playerSpot check against currentRival
end

function reshuffleDeck()
  --for i=1,4 do
    local hagalIndex = Global.getVar("hagalSpot")
    local hagalDeck = GetDeckOrCard(hagalDiscard[hagalIndex])
    if hagalDeck != nil then
        refreshPos = getObjectFromGUID(hagalDraw[hagalIndex]).getPosition()
        refreshPos.y = 2
        hagalDeck.flip()
        hagalDeck.setPositionSmooth(refreshPos,false,true)
        Wait.frames(function()
          local hagalDraw = GetDeckOrCard(hagalDraw[hagalIndex])
          hagalDraw.shuffle()
          hagalDraw.shuffle()
        end,45)
       self.editButton({index=0,label="Draw Card",click_function="drawHagal"})
    end
  --end
end

function processDraw(card)
  local playerPingCount = 0
  local playerCheck = Player.getPlayers()

  for _, playerPing in ipairs(playerCheck) do
    if playerPing.color == "Red" or playerPing.color == "Blue" or playerPing.color == "Orange" or playerPing.color == "Green" then
      playerPingCount = playerPingCount + 1
    end
  end

  local cardDetails = getObjectFromGUID(hagalBag).call("getCard",{card.getName()})
  local locationDetails = hagalLocations[card.getName()]
  local spiceRun = 0
  local reshuffleCheck = 0
  local churnCheck = 0
  local influenceCheck = 0
  local interstellarCheck = 0
  local ixCheck = 0
  local dualCardCheck = 0
  local dreadCount = 0
  local dreadCheck = 0

  for _, blockObject in ipairs(getObjectFromGUID("4a0d84").getObjects()) do
    if blockObject.tag == "Block" and blockObject.getName() == defaultColorList[rivalColor] then
        local pos = blockObject.getPosition()
        if pos.z > 5.35 then
          influenceCheck = 1
        end
    end
  end

  for _, tokenObject in ipairs(getObjectFromGUID(boardZone[rivalColor]).getObjects()) do
    if tokenObject.getName() == (defaultColorList[rivalColor] .. " Dreadnought") then
      dreadCount = dreadCount + 1
    end
  end

  ::DualCardRevisit::
  if card.getName() != "Harvest Spice" and card.getName() != "Reshuffle" and card.getName() != "Imperium Churn" then
    if card.getName() != "Foldspace or Interstellar" and card.getName() != "Smuggling or Interstellar" and card.getName() != "Interstellar Shipping" and card.getName() != "Dreadnought" and card.getName() != "Dreadnought 1P" then
      locationScan = getObjectFromGUID(locationDetails.zone).getObjects()
    else
      if card.getName() == "Interstellar Shipping" then
        ixCheck = 1
        if influenceCheck == 1 then
          locationScan = getObjectFromGUID("7b1013").getObjects()
        else
          interstellarCheck = 1
        end
      elseif card.getName() == "Smuggling or Interstellar" then
        ixCheck = 1
        if influenceCheck == 1 then
          locationScan = getObjectFromGUID("7b1013").getObjects()
          locationDetails = hagalLocations["Interstellar Shipping"]
        else
          dualCardCheck = 1
          locationScan = getObjectFromGUID("9c5484").getObjects()
          locationDetails = hagalLocations["Smuggling or Interstellar"]
        end
      elseif card.getName() == "Foldspace or Interstellar" then
        ixCheck = 1
        if influenceCheck == 1 then
          locationScan = getObjectFromGUID("7b1013").getObjects()
          locationDetails = hagalLocations["Interstellar Shipping"]
        else
          dualCardCheck = 1
          locationScan = getObjectFromGUID("57c221").getObjects()
          locationDetails = hagalLocations["Foldspace or Interstellar"]
        end
      elseif card.getName() == "Dreadnought" then
        if dreadCount == 0 then
          dreadCheck = 1
        else
          locationScan = getObjectFromGUID("cfb1c9").getObjects()
        end
      elseif card.getName() == "Dreadnought 1P" then
        if dreadCount == 0 then
          dreadCheck = 1
        else
          locationScan = getObjectFromGUID("cfb1c9").getObjects()
        end
      end
    end
  elseif card.getName() == "Harvest Spice" then
    harvestSpice()
    spiceRun = 1
  elseif card.getName() == "Reshuffle" then
    reshuffleCheck = 1
    Wait.frames(function()
      reshuffleDeck()
    end,60)
  elseif card.getName() == "Imperium Churn" then
    churnCheck = 1
    cardChurn()
  end

  local locationCheck = 0

  if spiceRun == 0 and reshuffleCheck == 0 and churnCheck == 0 and interstellarCheck == 0 then
    for _, item in ipairs(locationScan) do
      if item.getDescription() == "Agent" then
        locationCheck = 1
      end
    end

  if locationCheck == 1 or interstellarCheck == 1 or dreadCheck == 1 then
    if locationCheck == 1 then
      broadcastToAll("Agent already at location - Draw a new card")
      if dualCardCheck == 0 then
        if card.getName() == "Smuggling or Interstellar" or card.getName() == "Foldspace or Interstellar" then
          influenceCheck = 0
          goto DualCardRevisit
        end
      end
    elseif interstellarCheck == 1 then
      broadcastToAll("Rival does not have enough influence with the Spacing Guild - Draw a new card")
    elseif dreadCheck == 1 then
      broadcastToAll("Rival has already deployed both dreadnoughts - Draw a new card")
    end
  else
    if card.getName() == "Arrakeen" then
      broadcastToAll("Perform the Rival's Signature Ability!")
    end

    if card.getName() == "Tech Negotiation" then
      local techPrice = {0, 0, 0}
      local rivalTech = 0
      local rivalTile = {"", "", ""}
      local techNegotiatorDiscount = 0

      for _, negObj in ipairs(getObjectFromGUID("5e4ef3").getObjects()) do
        if negObj.getName() == defaultColorList[rivalColor] and negObj.tag == "Block" then
          techNegotiatorDiscount = techNegotiatorDiscount + 1
        end
      end

      if getObjectFromGUID(firstPlayerToken).getVar("riseIX") == 1 then
        broadcastToAll("Calculating Rival Tech Tile Purchase...")
        startLuaCoroutine(self, "techRivalCheck")
      end

      Wait.frames(function()
        if getObjectFromGUID(firstPlayerToken).getVar("riseIX") == 1 then
          startLuaCoroutine(self, "techRivalCheck")
        end
      end, 45)

      Wait.frames(function()
        if getObjectFromGUID(firstPlayerToken).getVar("riseIX") == 1 then
          startLuaCoroutine(self, "techRivalCheck")
        end
      end, 90)

      Wait.frames(function()
        local techBuy = {"", "", ""}
        for i=1, 3 do
          for _, techObject in ipairs(getObjectFromGUID(techZones[i]).getObjects()) do
            techRot = techObject.getRotation()
            if techObject.getDescription() == "Tech" and techObject.getName() != "" and techObject.getName() != nil then
              local techDetails = getObjectFromGUID(ixBag).call("getCard",{techObject.getName()})
              if techRot.z > 350 or techRot.z < 10 then
                if techDetails.Rival == 1 then
                  techPrice[i] = techDetails.Spice
                  techBuy[i] = techObject.getName()
                  rivalTile[i] = techObject.getGUID()
                  if techPrice[i] > (getObjectFromGUID(spiceBowls[rivalColor]).getVar("spiceCount")+1) then
                    techPrice[i] = 0
                  end
                else
                  techPrice[i] = 0
                end
              end
            end
          end
        end

        if techPrice[1] != 0 and techPrice[1] >= techPrice[2] and techPrice[1] >= techPrice[3] and getObjectFromGUID(spiceBowls[rivalColor]).getVar("spiceCount") >= (techPrice[1]-1-techNegotiatorDiscount) then
          rivalTech = 1
          broadcastToAll("Rival buys the " .. techBuy[1] .. " tech tile")
          techTilePrice = (techPrice[1]-1-techNegotiatorDiscount)
          startLuaCoroutine(self, "spendTechResources")
          resetNegotiatorStart()

          local tilePos = getObjectFromGUID(playerBoard[rivalColor]).getPosition()
          tilePos.x = tilePos.x + math.random(-4,4)
          tilePos.y = 2.5
          tilePos.z = tilePos.z + math.random(-1,1)

          getObjectFromGUID(rivalTile[1]).setPositionSmooth(tilePos)

          local topFlip = ""
          local nextTech = 0
          for _, techObject in ipairs(getObjectFromGUID(techZones[rivalTech]).getObjects()) do
            techPos = techObject.getPosition()
            if techObject.getDescription() != "IX" then
              if techPos.y > nextTech then
                topFlip = techObject.getGUID()
                nextTech = techPos.y
              end
            end
          end
          getObjectFromGUID(topFlip).flip()

        elseif techPrice[2] != 0 and techPrice[2] > techPrice[1] and techPrice[2] >= techPrice[3] and getObjectFromGUID(spiceBowls[rivalColor]).getVar("spiceCount") >= (techPrice[2]-1-techNegotiatorDiscount) then
          rivalTech = 2
          broadcastToAll("Rival buys the " .. techBuy[2] .. " tech tile")
          techTilePrice = (techPrice[2]-1-techNegotiatorDiscount)
          startLuaCoroutine(self, "spendTechResources")
          resetNegotiatorStart()

          local tilePos = getObjectFromGUID(playerBoard[rivalColor]).getPosition()
          tilePos.x = tilePos.x + math.random(-4,4)
          tilePos.y = 2.5
          tilePos.z = tilePos.z + math.random(-1,1)

          getObjectFromGUID(rivalTile[2]).setPositionSmooth(tilePos)

          local topFlip = ""
          local nextTech = 0
          for _, techObject in ipairs(getObjectFromGUID(techZones[rivalTech]).getObjects()) do
            techPos = techObject.getPosition()
            if techObject.getDescription() != "IX" then
              if techPos.y > nextTech then
                topFlip = techObject.getGUID()
                nextTech = techPos.y
              end
            end
          end
          getObjectFromGUID(topFlip).flip()

        elseif techPrice[3] != 0 and techPrice[3] > techPrice[1] and techPrice[3] > techPrice[2] and getObjectFromGUID(spiceBowls[rivalColor]).getVar("spiceCount") >= (techPrice[3]-1-techNegotiatorDiscount) then
          rivalTech = 3
          broadcastToAll("Rival buys the " .. techBuy[3] .. " tech tile")
          techTilePrice = (techPrice[3]-1-techNegotiatorDiscount)
          startLuaCoroutine(self, "spendTechResources")
          resetNegotiatorStart()

          local tilePos = getObjectFromGUID(playerBoard[rivalColor]).getPosition()
          tilePos.x = tilePos.x + math.random(-4,4)
          tilePos.y = 2.5
          tilePos.z = tilePos.z + math.random(-1,1)

          getObjectFromGUID(rivalTile[3]).setPositionSmooth(tilePos)

          local topFlip = ""
          local nextTech = 0
          for _, techObject in ipairs(getObjectFromGUID(techZones[rivalTech]).getObjects()) do
            techPos = techObject.getPosition()
            if techObject.getDescription() != "IX" then
              if techPos.y > nextTech then
                topFlip = techObject.getGUID()
                nextTech = techPos.y
              end
            end
          end
          getObjectFromGUID(topFlip).flip()

        else
          rivalTech = 0
          getObjectFromGUID(playerBoard[rivalColor]).call("sendNegotiator", {})
        end
      end,135)
    end

    if card.getName() == "Carthag R" then
      broadcastToAll("Advance the Rival One Space on the Tleilaxu Track")      
      researchChurn(3)
    end

    if card.getName() == "Carthag L" then
      broadcastToAll("Advance the Rival One Space on the Tleilaxu Track")  
      researchChurn(2)    
    end

    if card.getName() == "Carthag W" then
      broadcastToAll("Advance the Rival One Space on the Tleilaxu Track")      
    end

    if card.getName() == "Research Station" then
      broadcastToAll("Advance the Rival Two Spaces on the Tleilaxu Track")
    end

    if card.getName() == "Interstellar Shipping" then
      freighterAction()
      Wait.frames(function()
        freighterAction()
      end,60)
      --broadcastToAll("Review Rival freighter actions for Interstellar Shipping location")
    end

    if card.getName() == "Smuggling or Interstellar" then
        if dualCardCheck == 0 then
          --broadcastToAll("Review Rival freighter actions for Interstellar Shipping location")
          freighterAction()
          Wait.frames(function()
            freighterAction()
          end,60)
        else
          --broadcastToAll("Review Rival freighter actions for Smuggling location")
          freighterAction()
        end
    end

    if card.getName() == "Foldspace or Interstellar" then
      if dualCardCheck == 0 then
          --broadcastToAll("Review Rival freighter actions for Interstellar Shipping location")
          freighterAction()
          Wait.frames(function()
            freighterAction()
          end,60)
      else
        local cubeQuery = getObjectFromGUID(influenceZones[3]).getObjects()
        for _, item in ipairs(cubeQuery) do
          if item.tag == "Block" and item.getName() == defaultColorList[rivalColor] then
              local pos = item.getPosition()
              pos.z = pos.z + 0.9

              if pos.z > 8.64 then
                pos.z = pos.z - 0.9
              end
              item.setPositionSmooth(pos,false,true)
              if round(pos.z,2) == 5.41 then
                getObjectFromGUID("2da390").call(vpIncrease[rivalColor],{})
              end
          end
        end
      end
    end

    if reshuffleCheck == 0 then
      rivalAgent.setPositionSmooth(locationDetails.location,false,true)
    end

    if card.getName() == "Dreadnought" or card.getName() == "Dreadnought 1P" then
      if dreadCheck != 1 then
        getObjectFromGUID(playerBoard[rivalColor]).call("addDreadnought", {})
      end
      if card.getName() == "Dreadnought 1P" then
        local techPrice = {0, 0, 0}
        local rivalTech = 0
        local rivalTile = {"", "", ""}
        local techNegotiatorDiscount = 0

        for _, negObj in ipairs(getObjectFromGUID("5e4ef3").getObjects()) do
          if negObj.getName() == defaultColorList[rivalColor] and negObj.tag == "Block" then
            techNegotiatorDiscount = techNegotiatorDiscount + 1
          end
        end

        if getObjectFromGUID(firstPlayerToken).getVar("riseIX") == 1 then
          broadcastToAll("Calculating Rival Tech Tile Purchase...")
          startLuaCoroutine(self, "techRivalCheck")
        end

        Wait.frames(function()
          if getObjectFromGUID(firstPlayerToken).getVar("riseIX") == 1 then
            startLuaCoroutine(self, "techRivalCheck")
          end
        end, 45)

        Wait.frames(function()
          if getObjectFromGUID(firstPlayerToken).getVar("riseIX") == 1 then
            startLuaCoroutine(self, "techRivalCheck")
          end
        end, 90)

        Wait.frames(function()
          local techBuy = {"", "", ""}
          for i=1, 3 do
            for _, techObject in ipairs(getObjectFromGUID(techZones[i]).getObjects()) do
              techRot = techObject.getRotation()
              if techObject.getDescription() == "Tech" and techObject.getName() != "" and techObject.getName() != nil then
                local techDetails = getObjectFromGUID(ixBag).call("getCard",{techObject.getName()})
                if techRot.z > 350 or techRot.z < 10 then
                  if techDetails.Rival == 1 then
                    techPrice[i] = techDetails.Spice
                    techBuy[i] = techObject.getName()
                    rivalTile[i] = techObject.getGUID()
                    if techPrice[i] > (getObjectFromGUID(spiceBowls[rivalColor]).getVar("spiceCount")) then
                      techPrice[i] = 0
                    end
                  else
                    techPrice[i] = 0
                  end
                end
              end
            end
          end

          if techPrice[1] != 0 and techPrice[1] >= techPrice[2] and techPrice[1] >= techPrice[3] and getObjectFromGUID(spiceBowls[rivalColor]).getVar("spiceCount") >= (techPrice[1]-techNegotiatorDiscount) then
            rivalTech = 1
            broadcastToAll("Rival buys the " .. techBuy[1] .. " tech tile")
            techTilePrice = (techPrice[1]-techNegotiatorDiscount)
            startLuaCoroutine(self, "spendTechResources")
            resetNegotiatorStart()

            local tilePos = getObjectFromGUID(playerBoard[rivalColor]).getPosition()
            tilePos.x = tilePos.x + math.random(-4,4)
            tilePos.y = 2.5
            tilePos.z = tilePos.z + math.random(-1,1)

            getObjectFromGUID(rivalTile[1]).setPositionSmooth(tilePos)

            local topFlip = ""
            local nextTech = 0
            for _, techObject in ipairs(getObjectFromGUID(techZones[rivalTech]).getObjects()) do
              techPos = techObject.getPosition()
              if techObject.getDescription() != "IX" then
                if techPos.y > nextTech then
                  topFlip = techObject.getGUID()
                  nextTech = techPos.y
                end
              end
            end
            getObjectFromGUID(topFlip).flip()

          elseif techPrice[2] != 0 and techPrice[2] > techPrice[1] and techPrice[2] >= techPrice[3] and getObjectFromGUID(spiceBowls[rivalColor]).getVar("spiceCount") >= (techPrice[2]-techNegotiatorDiscount) then
            rivalTech = 2
            broadcastToAll("Rival buys the " .. techBuy[2] .. " tech tile")
            techTilePrice = (techPrice[2]-techNegotiatorDiscount)
            startLuaCoroutine(self, "spendTechResources")
            resetNegotiatorStart()

            local tilePos = getObjectFromGUID(playerBoard[rivalColor]).getPosition()
            tilePos.x = tilePos.x + math.random(-4,4)
            tilePos.y = 2.5
            tilePos.z = tilePos.z + math.random(-1,1)

            getObjectFromGUID(rivalTile[2]).setPositionSmooth(tilePos)

            local topFlip = ""
            local nextTech = 0
            for _, techObject in ipairs(getObjectFromGUID(techZones[rivalTech]).getObjects()) do
              techPos = techObject.getPosition()
              if techObject.getDescription() != "IX" then
                if techPos.y > nextTech then
                  topFlip = techObject.getGUID()
                  nextTech = techPos.y
                end
              end
            end
            getObjectFromGUID(topFlip).flip()

          elseif techPrice[3] != 0 and techPrice[3] > techPrice[1] and techPrice[3] > techPrice[2] and getObjectFromGUID(spiceBowls[rivalColor]).getVar("spiceCount") >= (techPrice[3]-techNegotiatorDiscount) then
            rivalTech = 3
            broadcastToAll("Rival buys the " .. techBuy[3] .. " tech tile")
            techTilePrice = (techPrice[3]-techNegotiatorDiscount)
            startLuaCoroutine(self, "spendTechResources")
            resetNegotiatorStart()

            local tilePos = getObjectFromGUID(playerBoard[rivalColor]).getPosition()
            tilePos.x = tilePos.x + math.random(-4,4)
            tilePos.y = 2.5
            tilePos.z = tilePos.z + math.random(-1,1)

            getObjectFromGUID(rivalTile[3]).setPositionSmooth(tilePos)

            local topFlip = ""
            local nextTech = 0
            for _, techObject in ipairs(getObjectFromGUID(techZones[rivalTech]).getObjects()) do
              techPos = techObject.getPosition()
              if techObject.getDescription() != "IX" then
                if techPos.y > nextTech then
                  topFlip = techObject.getGUID()
                  nextTech = techPos.y
                end
              end
            end
            getObjectFromGUID(topFlip).flip()
          end
        end,135)
      end
    end

    if cardDetails.Troops > 0 and cardDetails.Combat == false then
      local waitDelay = 0
      local troopCount = cardDetails.Troops
      local playerArea = getObjectFromGUID(playerBoard[rivalColor])
      for i=1, troopCount do
        Wait.frames(function()
          playerArea.call("addGarrison",{})
        end, waitDelay)
        waitDelay = waitDelay + 45
      end
    elseif cardDetails.Troops > 0 and cardDetails.Combat == true then
      local waitDelay = 0
      local troopCount = cardDetails.Troops
      local playerArea = getObjectFromGUID(playerBoard[rivalColor])
      for i=1, troopCount do
        Wait.frames(function()
          playerArea.call("addGarrison",{})
        end, waitDelay)
        waitDelay = waitDelay + 45
      end
      if expertTroop == 0 then
       local waitDelay = 90
       local troopCount = cardDetails.Troops
       local playerArea = getObjectFromGUID(playerBoard[rivalColor])

       for i=1, troopCount do
        Wait.frames(function()
          if playerArea.call("addDreadConflict",{}) == 0 then
            playerArea.call("addConflict",{})
          end
        end, waitDelay)
        waitDelay = waitDelay + 45
       end
      end

    end

    if cardDetails.Combat == true and expertTroop == 0 then
      Wait.frames(function()
        if getObjectFromGUID(playerBoard[rivalColor]).call("addDreadConflict",{}) == 0 then
          getObjectFromGUID(playerBoard[rivalColor]).call("addConflict",{})
        end
      end, 60)
      Wait.frames(function()
        if getObjectFromGUID(playerBoard[rivalColor]).call("addDreadConflict",{}) == 0 then
          getObjectFromGUID(playerBoard[rivalColor]).call("addConflict",{})
        end
      end, 75)
    end

    if cardDetails.Fremen == true then
      local cubeQuery = getObjectFromGUID(influenceZones[1]).getObjects()
      for _, item in ipairs(cubeQuery) do
        if item.tag == "Block" and item.getName() == defaultColorList[rivalColor] then
            local pos = item.getPosition()
            pos.z = pos.z + 0.9

            if pos.z > -3.62 then
              pos.z = pos.z - 0.9
            end
            item.setPositionSmooth(pos,false,true)
            if round(pos.z,2) == -6.82 then
              getObjectFromGUID("2da390").call(vpIncrease[rivalColor],{})
            end
        end
      end
    end

    if cardDetails.Bene == true then
      local cubeQuery = getObjectFromGUID(influenceZones[2]).getObjects()
      for _, item in ipairs(cubeQuery) do
        if item.tag == "Block" and item.getName() == defaultColorList[rivalColor] then
            local pos = item.getPosition()
            pos.z = pos.z + 0.9

            if pos.z > 2.53 then
              pos.z = pos.z - 0.9
            end
            item.setPositionSmooth(pos,false,true)
            if round(pos.z,2) == -0.74 then
              getObjectFromGUID("2da390").call(vpIncrease[rivalColor],{})
            end
        end
      end
    end

    if cardDetails.Guild == true then
      local cubeQuery = getObjectFromGUID(influenceZones[3]).getObjects()
      for _, item in ipairs(cubeQuery) do
        if item.tag == "Block" and item.getName() == defaultColorList[rivalColor] then
            local pos = item.getPosition()
            pos.z = pos.z + 0.9

            if pos.z > 8.64 then
              pos.z = pos.z - 0.9
            end
            item.setPositionSmooth(pos,false,true)
            if round(pos.z,2) == 5.41 then
              getObjectFromGUID("2da390").call(vpIncrease[rivalColor],{})
            end
        end
      end
    end

    if cardDetails.Emperor == true then
      local cubeQuery = getObjectFromGUID(influenceZones[4]).getObjects()
      for _, item in ipairs(cubeQuery) do
        if item.tag == "Block" and item.getName() == defaultColorList[rivalColor] then
            local pos = item.getPosition()
            pos.z = pos.z + 0.9

            if pos.z > 14.80 then
              pos.z = pos.z - 0.9
            end
            item.setPositionSmooth(pos,false,true)
            if round(pos.z,2) == 11.58 then
              getObjectFromGUID("2da390").call(vpIncrease[rivalColor],{})
            end
        end
      end
    end

    if playerPingCount == 1 then
     if currentRival == 1 then
      currentRival = 2
     elseif currentRival == 2 then
      currentRival = 3
     elseif currentRival == 3 then
      currentRival = 1
     end
     buttons = self.getButtons()
     if buttons != nil then
       for i, v in pairs(buttons) do
         if v.label == "Draw Card" then
           buttonIndex = i-1
         end
       end
     end

     if currentRival != 3 then
      self.editButton({index=buttonIndex, color=turnOrder[currentRival]})
     else
      self.editButton({index=buttonIndex, color=turnOrder[currentRival]})
      self.editButton({index=buttonIndex, label="Player Turn"})
     end

    end
    end
  end
  --end

  if card.getName() == "Smuggling or Interstellar" then
    if dualCardCheck == 0 then
      broadcastToAll("Interstellar Shipping")
    else
      broadcastToAll("Smuggling")
    end
  elseif card.getName() == "Foldspace or Interstellar" then
    if dualCardCheck == 0 then
      broadcastToAll("Interstellar Shipping")
    else
      broadcastToAll("Foldspace")
    end
  elseif card.getName() == "Dreadnought 1P" then
      broadcastToAll("Dreadnought")
  elseif card.getName() == "Carthag R" then
      broadcastToAll("Carthag")
  elseif card.getName() == "Carthag L" then
      broadcastToAll("Carthag")
  elseif card.getName() == "Carthag W" then
      broadcastToAll("Carthag")
  else
    broadcastToAll(card.getName())
  end

  Wait.frames(function()
    if getObjectFromGUID(firstPlayerToken).getVar("riseIX") == 1 then
      broadcastToAll("Checking Tech Tiles for House Hagal")
      startLuaCoroutine(self, "techRivalCheck")
    end
  end, 180)
end

function techRivalCheck()
  local techCheck = {0, 0, 0}
  local techStack = {0, 0, 0}
  local topTech = {"", "", ""}

  for i=1, 3 do
    for _, techObject in ipairs(getObjectFromGUID(techZones[i]).getObjects()) do
      techStack[i] = techStack[i] + 1
      techRot = techObject.getRotation()
      if techObject.getDescription() == "Tech" and techObject.getName() != "" and techObject.getName() != nil then
        local techDetails = getObjectFromGUID(ixBag).call("getCard",{techObject.getName()})
        if techRot.z > 350 or techRot.z < 10 then
          topTech[i] = techObject.getGUID()
          if techDetails.Rival == 1 then
            techCheck[i] = 1
          end
        end
      end
    end
  end

  local techSum = 0
  for i=1, 3 do
      techSum = techSum + techCheck[i]
  end

  if techSum == 0 then
    techTileRefresh(topTech, techStack)
  end

  local Time = os.clock() + 0.2
    while os.clock() < Time do
      coroutine.yield(0)
    end

    return 1
end

function techTileRefresh(topTechCurrent, techStackCurrent)

  local techIndex = 0
  local nextTech = 0
  local topFlip = ""

  if techStackCurrent[1] >= techStackCurrent[2] and techStackCurrent[1] >= techStackCurrent[3] then
    getObjectFromGUID(topTechCurrent[1]).setPositionSmooth({33.70, 2.5, 22.80})
    techIndex = 1
  elseif techStackCurrent[2] >= techStackCurrent[1] and techStackCurrent[2] >= techStackCurrent[3] then
    getObjectFromGUID(topTechCurrent[2]).setPositionSmooth({33.70, 2.5, 22.80})
    techIndex = 2
  elseif techStackCurrent[3] >= techStackCurrent[1] and techStackCurrent[3] >= techStackCurrent[2] then
    getObjectFromGUID(topTechCurrent[3]).setPositionSmooth({33.70, 2.5, 22.80})
    techIndex = 3
  end

  for _, techObject in ipairs(getObjectFromGUID(techZones[techIndex]).getObjects()) do
    techPos = techObject.getPosition()
    if techObject.getDescription() != "IX" then
      if techPos.y > nextTech then
        topFlip = techObject.getGUID()
        nextTech = techPos.y
      end
    end
  end

  getObjectFromGUID(topFlip).flip()
end

function resetNegotiatorStart()
  startLuaCoroutine(self, "resetNegotiator")
end

function resetNegotiator()
  negotiatorArea = getObjectFromGUID("5e4ef3").getObjects()

  local resetNegSupply = {0, 0, 0}

  if rivalColor == 1 then
    resetNegSupply = {redSupply[1] + (math.random()/2), redSupply[2], redSupply[3] + (math.random()/2)}
  elseif rivalColor == 2 then
    resetNegSupply = {blueSupply[1] + (math.random()/2), blueSupply[2], blueSupply[3] + (math.random()/2)}
  elseif rivalColor == 3 then
    resetNegSupply = {orangeSupply[1] + (math.random()/2), orangeSupply[2], orangeSupply[3] + (math.random()/2)}
  elseif rivalColor == 4 then
    resetNegSupply = {greenSupply[1] + (math.random()/2), greenSupply[2], greenSupply[3] + (math.random()/2)}
  end

  for _, item in ipairs(negotiatorArea) do
    if item.tag == "Block" and item.getName() == defaultColorList[rivalColor] then
      item.setPositionSmooth(resetNegSupply, false, true)
    end

    local Time = os.clock() + 0.1
      while os.clock() < Time do
        coroutine.yield(0)
      end
  end
  return 1
end

function spendTechResources()
  for i=1, techTilePrice do
    getObjectFromGUID(playerBoard[rivalColor]).call("spendOneSpice")
    local Time = os.clock() + 0.4
    while os.clock() < Time do
      coroutine.yield(0)
    end
  end
  --[[local itemCount = techTilePrice

  local rivalItems = getObjectFromGUID(boardZone[rivalColor]).getObjects()

  for _, item in ipairs(rivalItems) do
    if item.getName() == "5 Spice" and itemCount > 4 then
      local Time = os.clock() + 0.2
      while os.clock() < Time do
        coroutine.yield(0)
      end

      if rivalColor == 1 or rivalColor == 2 then
        getObjectFromGUID("9f81fa").putObject(item)
      elseif rivalColor == 3 or rivalColor == 4 then
        getObjectFromGUID("b70325").putObject(item)
      end
      itemCount = itemCount - 5

    elseif item.getName() == "1 Spice" and itemCount > 0 then
      local Time = os.clock() + 0.2
      while os.clock() < Time do
        coroutine.yield(0)
      end

      if rivalColor == 1 or rivalColor == 2 then
        getObjectFromGUID("9f81fa").putObject(item)
      elseif rivalColor == 3 or rivalColor == 4 then
        getObjectFromGUID("b70325").putObject(item)
      end
      itemCount = itemCount - 1
    end
  end
]]--
  return 1
end

function cardChurn()
  math.randomseed(os.time())
  local spotOne = math.random(1,5)
  ::GenNum::
  local spotTwo = math.random(1,5)
  if spotOne == spotTwo then
    goto GenNum
  end

  local cardOne = GetDeckOrCard(imperiumRow[spotOne])
  local cardTwo = GetDeckOrCard(imperiumRow[spotTwo])

  local posOne = cardOne.getPosition()
  local posTwo = cardTwo.getPosition()

  getObjectFromGUID(trashBin).putObject(cardOne)
  Wait.frames(function()
    getObjectFromGUID(trashBin).putObject(cardTwo)
  end,30)

  posOne.y = 2
  posTwo.y = 2

  Wait.frames(function()
    GetDeckOrCard(imperiumDeckZone).takeObject({position = posOne, flip = true})
  end,60)
  Wait.frames(function()
    GetDeckOrCard(imperiumDeckZone).takeObject({position = posTwo, flip = true})
  end,90)

end

function researchChurn(cardSpot)
  local researchCard = GetDeckOrCard(researchCardZones[cardSpot])

  local posCard = researchCard.getPosition()

  getObjectFromGUID(trashBin).putObject(researchCard)

  posCard.y = 12.75

  Wait.frames(function()
    GetDeckOrCard(researchCardZones[1]).takeObject({position = posCard, flip = true})
  end,60)
end

function harvestSpice()
  local playerPingCount = 0
  local playerCheck = Player.getPlayers()

  for _, playerPing in ipairs(playerCheck) do
    if playerPing.color == "Red" or playerPing.color == "Blue" or playerPing.color == "Orange" or playerPing.color == "Green" then
      playerPingCount = playerPingCount + 1
    end
  end

  local bonusSpice = {0,0,0}
  harvestCheck = 0
  harvestSpot = 0

  for i=1,3 do
    local spiceCheck = getObjectFromGUID(spiceZones[i]).getObjects()
    for _, item in ipairs(spiceCheck) do
      if item.getName() =="1 Spice" then
        bonusSpice[i] = bonusSpice[i] + 1
        harvestCheck = 1
      end
    end
  end

  if harvestCheck == 1 then
    local agentCount = 0
    local locationDetails = hagalLocations["Harvest Spice"]
    ::HarvestPoint::
    if bonusSpice[1] > bonusSpice[2] and bonusSpice[1] > bonusSpice[3] then
      harvestSpot = 1
    elseif bonusSpice[2] > bonusSpice[1] and bonusSpice[2] > bonusSpice[3] then
      harvestSpot = 2
    elseif bonusSpice[3] > bonusSpice[1] and bonusSpice[3] > bonusSpice[2] then
      harvestSpot = 3
    end
    if harvestSpot == 0 then
      bonusSpice[1] = bonusSpice[1] + 3
      bonusSpice[2] = bonusSpice[2] + 2
      bonusSpice[3] = bonusSpice[3] + 1
      goto HarvestPoint
    end
      local locationCheck = 0
      local locationScan = getObjectFromGUID(locationDetails.zone[harvestSpot]).getObjects()

      for _, item in ipairs(locationScan) do
        if item.getDescription() == "Agent" then
          locationCheck = 1
        end
      end
    if agentCount < 3 then
    if locationCheck == 1 then
      bonusSpice[harvestSpot] = (harvestSpot * -1)
      agentCount = agentCount + 1
      goto HarvestPoint
    else
      rivalAgent.setPositionSmooth(locationDetails.location[harvestSpot],false,true)

      if expertTroop == 0 then
      Wait.frames(function()
        if getObjectFromGUID(playerBoard[rivalColor]).call("addDreadConflict",{}) == 0 then
          getObjectFromGUID(playerBoard[rivalColor]).call("addConflict",{})
        end
      end, 60)
      Wait.frames(function()
        if getObjectFromGUID(playerBoard[rivalColor]).call("addDreadConflict",{}) == 0 then
          getObjectFromGUID(playerBoard[rivalColor]).call("addConflict",{})
        end
      end, 90)
      end

      local bowlPos = getObjectFromGUID(spiceBowls[rivalColor]).getPosition()
      bowlPos.y = 3.5
      local bonusSpice = getObjectFromGUID(spiceZones[harvestSpot]).getObjects()
      for _, item in ipairs(bonusSpice) do
        if item.getName() == "1 Spice" then
          item.setPositionSmooth(bowlPos, false, true)
        end
      end

      for i=1, (4-harvestSpot) do
        getObjectFromGUID(oneSpiceBag).takeObject({position = bowlPos})
        bowlPos.y = bowlPos.y + 1
      end

      if playerPingCount == 1 then
        if currentRival == 1 then
         currentRival = 2
        elseif currentRival == 2 then
         currentRival = 3
        elseif currentRival == 3 then
         currentRival = 1
        end
       buttons = self.getButtons()
       if buttons != nil then
        for i, v in pairs(buttons) do
          if v.label == "Draw Card" then
            buttonIndex = i-1
          end
        end
       end
       if currentRival != 3 then
        self.editButton({index=buttonIndex, color=turnOrder[currentRival]})
       else
        self.editButton({index=buttonIndex, color=turnOrder[currentRival]})
        self.editButton({index=buttonIndex, label="Player Turn"})
       end
      end
    end
    else
      broadcastToAll("Agents Already Present at Harvest Locations - Draw Another Card")
    end
  else
    broadcastToAll("No Bonus Spice Available for Rival - Draw Another Card")
  end
end

function expertTroopCheck()
  local diffCheck = getObjectFromGUID("2da390").getVar("difficultyLevel")
  local conflictDiscard = GetDeckOrCard("4a21d4")
  local conflictCount = 0
  local playerTroops = 0
  local rivalTroops = 0
  local conflictTroops = 0

  if conflictDiscard != nil then
   if conflictDiscard.name == "Card" or conflictDiscard.name == "CardCustom" then
    conflictCount = 1
   else
    conflictCount = conflictDiscard.getQuantity()
   end
  else
    conflictCount = 0
  end

  if  conflictCount < 6 and diffCheck == 3 then
    conflictTroops = getObjectFromGUID("02ca0a").getObjects()
    for _, item in ipairs(conflictTroops) do
      if item.getName() == defaultColorList[playerSpot] then
        playerTroops = playerTroops + 1
      elseif item.getName() == turnOrder[currentRival] then
        rivalTroops = rivalTroops + 1
      end
    end
    if (rivalTroops-playerTroops) >= 2 then
      expertTroop = 1
    else
      expertTroop = 0
    end
  end
end

function round(num, dec)
    local mult = 10^(dec or 0)
    return math.floor(num * mult + 0.5) / mult
end

-- ===== 1 Solaris 5090e6 (2716 chars) =====
buttonRed = 0
buttonGreen = 0
buttonBlue = 0

bagVarA = ""
bagVarB = ""

bowlRef = {"85ebad", "235331", "04d59b", "917162"}
bowlPos = {}

function bagLabel()
  buttonRed = 128
  buttonGreen = 128
  buttonBlue = 128

  buttonRed = buttonRed/255
  buttonGreen = buttonGreen/255
  buttonBlue = buttonBlue/255

  self.createButton({
    label="Take 1 Solaris", click_function="takeSolarisBut", function_owner=self,
    position={2.15,0.25,0.0}, rotation = {0,180,0}, height=250, width=850, font_size=125, font_color={1,1,1}, color={buttonRed, buttonGreen, buttonBlue}
  })
  self.createButton({
    label="Take 1 Solaris", click_function="takeSolarisBut", function_owner=self,
    position={-2.15,0.25,0.0}, rotation = {0,180,0}, height=250, width=850, font_size=125, font_color={1,1,1}, color={buttonRed, buttonGreen, buttonBlue}
  })
end

function takeSolarisBut(GO, color)

  for i=1,4 do
    bowlPos[i] = getObjectFromGUID(bowlRef[i]).getPosition()
    bowlPos[i].x = bowlPos[i].x + math.random()/3
    bowlPos[i].y = 4
    bowlPos[i].z = bowlPos[i].z + math.random()/3
  end

  if color == "Red" then
    solarisPos = bowlPos[1]
    tokenRot = {0,180,0}
  elseif color == "Blue" then
    solarisPos = bowlPos[2]
    tokenRot = {0,180,0}
  elseif color == "Orange" then
    solarisPos = bowlPos[3]
    tokenRot = {0,180,0}
  elseif color == "Green" then
    solarisPos = bowlPos[4]
    tokenRot = {0,180,0}
  end

  self.takeObject({position = solarisPos, rotation = tokenRot})
end

function takeSolaris(GO, color)

  for i=1,4 do
    bowlPos[i] = getObjectFromGUID(bowlRef[i]).getPosition()
    bowlPos[i].x = bowlPos[i].x + math.random()/3
    bowlPos[i].y = 4
    bowlPos[i].z = bowlPos[i].z + math.random()/3
  end

  if color == "Red" then
    solarisPos = bowlPos[1]
    tokenRot = {0,180,0}
  elseif color == "Blue" then
    solarisPos = bowlPos[2]
    tokenRot = {0,180,0}
  elseif color == "Orange" then
    solarisPos = bowlPos[3]
    tokenRot = {0,180,0}
  elseif color == "Green" then
    solarisPos = bowlPos[4]
    tokenRot = {0,180,0}
  end

  --self.takeObject({position = solarisPos, rotation = tokenRot})
  local solarisChange = self.takeObject()
  solarisChange.setPosition(solarisPos)
  solarisChange.setRotation(tokenRot)
end

function makeSolarisStart(colorCall)
  bagVarA = colorCall[1]
  bagVarB = colorCall[2]
  startLuaCoroutine(self,"makeSolarisChange")
end

function makeSolarisChange()
  for i=1,4 do
    takeSolaris(bagVarA, bagVarB)

    local Time = os.clock() + 0.25
      while os.clock() < Time do
        coroutine.yield(0)
      end
  end

  bagVarA = ""
  bagVarB = ""

  return 1
end

function clearLabel()
  self.clearButtons()
end

-- ===== 1 Spice 85289a (2970 chars) =====
buttonRed = 0
buttonGreen = 0
buttonBlue = 0

bowlRef = {"8655b7", "9a6fc5", "1d6251", "6fae7e"}
bowlPos = {}

bagVarA = ""
bagVarB = ""

function bagLabel()
  buttonRed = 255
  buttonGreen = 084
  buttonBlue = 0

  buttonRed = buttonRed/255
  buttonGreen = buttonGreen/255
  buttonBlue = buttonBlue/255

  self.createButton({
    label="Take 1 Spice", click_function="takeSpiceBut", function_owner=self,
    position={-2.15,0.25,0.0}, rotation = {0,180,0}, height=250, width=850, font_size=125, font_color={1,1,1}, color={buttonRed, buttonGreen, buttonBlue}
  })
  self.createButton({
    label="Take 1 Spice", click_function="takeSpiceBut", function_owner=self,
    position={2.15,0.25,0.0}, rotation = {0,180,0}, height=250, width=850, font_size=125, font_color={1,1,1}, color={buttonRed, buttonGreen, buttonBlue}
  })
end

function takeSpiceBut(GO, color)
  local spiceOffset = 0

  for i=1,4 do
    bowlPos[i] = getObjectFromGUID(bowlRef[i]).getPosition()
    bowlPos[i].x = bowlPos[i].x + math.random()/3
    bowlPos[i].y = 4 + spiceOffset
    bowlPos[i].z = bowlPos[i].z + math.random()/3
    spiceOffset = spiceOffset + 0.25
  end

  if color == "Red" then
    spicePos = bowlPos[1]
    tokenRot = {0,180,0}
  elseif color == "Blue" then
    spicePos = bowlPos[2]
    tokenRot = {0,180,0}
  elseif color == "Orange" then
    spicePos = bowlPos[3]
    tokenRot = {0,180,0}
  elseif color == "Green" then
    spicePos = bowlPos[4]
    tokenRot = {0,180,0}
  end

  self.takeObject({position = spicePos, rotation = tokenRot})
  --local spiceChange = self.takeObject()
  --spiceChange.setPosition(spicePos)
  --spiceChange.setRotation(tokenRot)
end

function takeSpice(GO, color)
  local spiceOffset = 0

  for i=1,4 do
    bowlPos[i] = getObjectFromGUID(bowlRef[i]).getPosition()
    bowlPos[i].x = bowlPos[i].x + math.random()/3
    bowlPos[i].y = 4 + spiceOffset
    bowlPos[i].z = bowlPos[i].z + math.random()/3
    spiceOffset = spiceOffset + 0.25
  end

  if color == "Red" then
    spicePos = bowlPos[1]
    tokenRot = {0,180,0}
  elseif color == "Blue" then
    spicePos = bowlPos[2]
    tokenRot = {0,180,0}
  elseif color == "Orange" then
    spicePos = bowlPos[3]
    tokenRot = {0,180,0}
  elseif color == "Green" then
    spicePos = bowlPos[4]
    tokenRot = {0,180,0}
  end

  --self.takeObject({position = spicePos, rotation = tokenRot})
  local spiceChange = self.takeObject()
  spiceChange.setPosition(spicePos)
  spiceChange.setRotation(tokenRot)
end

function makeSpiceStart(colorCall)
  bagVarA = colorCall[1]
  bagVarB = colorCall[2]
  startLuaCoroutine(self,"makeSpiceChange")
end

function makeSpiceChange()
  for i=1,4 do
    takeSpice(bagVarA, bagVarB)

    local Time = os.clock() + 0.5
      while os.clock() < Time do
        coroutine.yield(0)
      end
  end

  bagVarA = ""
  bagVarB = ""

  return 1
end

function clearLabel()
  self.clearButtons()
end

-- ===== Councilor Bonus c2fa1c (1066 chars) =====
councilorPos = {{-45.37, 2, -20.68}, {-19.99, 2, -20.83}, {9.94, 2, -20.91}, {34.72, 2, -20.93}}

function onCollisionEnter(info)
  bonusPos = self.getPosition()

  if info.collision_object.getName() == "Red Councilor" then
    self.setPositionSmooth(councilorPos[1],false,true)
    self.setRotationSmooth({0,180,0})
    info.collision_object.setPositionSmooth(bonusPos,false,true)
  elseif info.collision_object.getName() == "Blue Councilor" then
    self.setPositionSmooth(councilorPos[2],false,true)
    self.setRotationSmooth({0,180,0})
    info.collision_object.setPositionSmooth(bonusPos,false,true)
  elseif info.collision_object.getName() == "Orange Councilor" then
    self.setPositionSmooth(councilorPos[3],false,true)
    self.setRotationSmooth({0,180,0})
    info.collision_object.setPositionSmooth(bonusPos,false,true)
  elseif info.collision_object.getName() == "Green Councilor" then
    self.setPositionSmooth(councilorPos[4],false,true)
    self.setRotationSmooth({0,180,0})
    info.collision_object.setPositionSmooth(bonusPos,false,true)
  end
end

-- ===== Councilor Bonus f63f4b (1066 chars) =====
councilorPos = {{-45.37, 2, -20.68}, {-19.99, 2, -20.83}, {9.94, 2, -20.91}, {34.72, 2, -20.93}}

function onCollisionEnter(info)
  bonusPos = self.getPosition()

  if info.collision_object.getName() == "Red Councilor" then
    self.setPositionSmooth(councilorPos[1],false,true)
    self.setRotationSmooth({0,180,0})
    info.collision_object.setPositionSmooth(bonusPos,false,true)
  elseif info.collision_object.getName() == "Blue Councilor" then
    self.setPositionSmooth(councilorPos[2],false,true)
    self.setRotationSmooth({0,180,0})
    info.collision_object.setPositionSmooth(bonusPos,false,true)
  elseif info.collision_object.getName() == "Orange Councilor" then
    self.setPositionSmooth(councilorPos[3],false,true)
    self.setRotationSmooth({0,180,0})
    info.collision_object.setPositionSmooth(bonusPos,false,true)
  elseif info.collision_object.getName() == "Green Councilor" then
    self.setPositionSmooth(councilorPos[4],false,true)
    self.setRotationSmooth({0,180,0})
    info.collision_object.setPositionSmooth(bonusPos,false,true)
  end
end

-- ===== Councilor Bonus 109802 (1066 chars) =====
councilorPos = {{-45.37, 2, -20.68}, {-19.99, 2, -20.83}, {9.94, 2, -20.91}, {34.72, 2, -20.93}}

function onCollisionEnter(info)
  bonusPos = self.getPosition()

  if info.collision_object.getName() == "Red Councilor" then
    self.setPositionSmooth(councilorPos[1],false,true)
    self.setRotationSmooth({0,180,0})
    info.collision_object.setPositionSmooth(bonusPos,false,true)
  elseif info.collision_object.getName() == "Blue Councilor" then
    self.setPositionSmooth(councilorPos[2],false,true)
    self.setRotationSmooth({0,180,0})
    info.collision_object.setPositionSmooth(bonusPos,false,true)
  elseif info.collision_object.getName() == "Orange Councilor" then
    self.setPositionSmooth(councilorPos[3],false,true)
    self.setRotationSmooth({0,180,0})
    info.collision_object.setPositionSmooth(bonusPos,false,true)
  elseif info.collision_object.getName() == "Green Councilor" then
    self.setPositionSmooth(councilorPos[4],false,true)
    self.setRotationSmooth({0,180,0})
    info.collision_object.setPositionSmooth(bonusPos,false,true)
  end
end

-- ===== Councilor Bonus 3f0c1a (1066 chars) =====
councilorPos = {{-45.37, 2, -20.68}, {-19.99, 2, -20.83}, {9.94, 2, -20.91}, {34.72, 2, -20.93}}

function onCollisionEnter(info)
  bonusPos = self.getPosition()

  if info.collision_object.getName() == "Red Councilor" then
    self.setPositionSmooth(councilorPos[1],false,true)
    self.setRotationSmooth({0,180,0})
    info.collision_object.setPositionSmooth(bonusPos,false,true)
  elseif info.collision_object.getName() == "Blue Councilor" then
    self.setPositionSmooth(councilorPos[2],false,true)
    self.setRotationSmooth({0,180,0})
    info.collision_object.setPositionSmooth(bonusPos,false,true)
  elseif info.collision_object.getName() == "Orange Councilor" then
    self.setPositionSmooth(councilorPos[3],false,true)
    self.setRotationSmooth({0,180,0})
    info.collision_object.setPositionSmooth(bonusPos,false,true)
  elseif info.collision_object.getName() == "Green Councilor" then
    self.setPositionSmooth(councilorPos[4],false,true)
    self.setRotationSmooth({0,180,0})
    info.collision_object.setPositionSmooth(bonusPos,false,true)
  end
end

-- ===== Rules 9ac7d6 (5715 chars) =====
function onLoad()
  buttonRed = 195
  buttonGreen = 64
  buttonBlue = 1

  buttonRed = buttonRed/255
  buttonGreen = buttonGreen/255
  buttonBlue = buttonBlue/255

  self.clearButtons()
  self.createButton ({
    ['click_function'] = 'setupPage',
    ['label'] = 'Setup',
    ['function_owner'] = self,
    ['position'] = {-2.7, 0.3, -1.6},
    ['rotation'] =  {0, 0, 0},
    ['scale'] = {0.7,1,0.7},
    ['width'] = 900,
    ['height'] = 200,
    ['font_size'] = 100,
    ['color'] = {buttonRed, buttonGreen, buttonBlue},
    ['font_color'] = "White"
  })
  self.createButton ({
    ['click_function'] = 'overviewPage',
    ['label'] = 'Overview',
    ['function_owner'] = self,
    ['position'] = {-2.7, 0.3, -1.3},
    ['rotation'] =  {0, 0, 0},
    ['scale'] = {0.7,1,0.7},
    ['width'] = 900,
    ['height'] = 200,
    ['font_size'] = 100,
    ['color'] = {buttonRed, buttonGreen, buttonBlue},
    ['font_color'] = "White"
  })
  self.createButton ({
    ['click_function'] = 'gameplayPage',
    ['label'] = 'Gameplay',
    ['function_owner'] = self,
    ['position'] = {-2.7, 0.3, -1.0},
    ['rotation'] =  {0, 0, 0},
    ['scale'] = {0.7,1,0.7},
    ['width'] = 900,
    ['height'] = 200,
    ['font_size'] = 100,
    ['color'] = {buttonRed, buttonGreen, buttonBlue},
    ['font_color'] = "White"
  })
  self.createButton ({
    ['click_function'] = 'agentPage',
    ['label'] = 'Agent Turn',
    ['function_owner'] = self,
    ['position'] = {-2.7, 0.3, -0.7},
    ['rotation'] =  {0, 0, 0},
    ['scale'] = {0.7,1,0.7},
    ['width'] = 900,
    ['height'] = 200,
    ['font_size'] = 100,
    ['color'] = {buttonRed, buttonGreen, buttonBlue},
    ['font_color'] = "White"
  })
  self.createButton ({
    ['click_function'] = 'revealPage',
    ['label'] = 'Reveal Turn',
    ['function_owner'] = self,
    ['position'] = {-2.7, 0.3, -0.4},
    ['rotation'] =  {0, 0, 0},
    ['scale'] = {0.7,1,0.7},
    ['width'] = 900,
    ['height'] = 200,
    ['font_size'] = 100,
    ['color'] = {buttonRed, buttonGreen, buttonBlue},
    ['font_color'] = "White"
  })
  self.createButton ({
    ['click_function'] = 'combatPage',
    ['label'] = 'Combat',
    ['function_owner'] = self,
    ['position'] = {-2.7, 0.3, -0.1},
    ['rotation'] =  {0, 0, 0},
    ['scale'] = {0.7,1,0.7},
    ['width'] = 900,
    ['height'] = 200,
    ['font_size'] = 100,
    ['color'] = {buttonRed, buttonGreen, buttonBlue},
    ['font_color'] = "White"
  })
  self.createButton ({
    ['click_function'] = 'makersRecallPage',
    ['label'] = 'Makers and Recall',
    ['function_owner'] = self,
    ['position'] = {-2.7, 0.3, 0.2},
    ['rotation'] =  {0, 0, 0},
    ['scale'] = {0.7,1,0.7},
    ['width'] = 900,
    ['height'] = 200,
    ['font_size'] = 100,
    ['color'] = {buttonRed, buttonGreen, buttonBlue},
    ['font_color'] = "White"
  })
  self.createButton ({
    ['click_function'] = 'strategyPage',
    ['label'] = 'Strategy Tips',
    ['function_owner'] = self,
    ['position'] = {-2.7, 0.3, 0.5},
    ['rotation'] =  {0, 0, 0},
    ['scale'] = {0.7,1,0.7},
    ['width'] = 900,
    ['height'] = 200,
    ['font_size'] = 100,
    ['color'] = {buttonRed, buttonGreen, buttonBlue},
    ['font_color'] = "White"
  })
  self.createButton ({
    ['click_function'] = 'referencePage',
    ['label'] = 'Reference Guide',
    ['function_owner'] = self,
    ['position'] = {-2.7, 0.3, 0.8},
    ['rotation'] =  {0, 0, 0},
    ['scale'] = {0.7,1,0.7},
    ['width'] = 900,
    ['height'] = 200,
    ['font_size'] = 100,
    ['color'] = {buttonRed, buttonGreen, buttonBlue},
    ['font_color'] = "White"
  })
  self.createButton ({
    ['click_function'] = 'boardPage',
    ['label'] = 'Board Guide',
    ['function_owner'] = self,
    ['position'] = {-2.7, 0.3, 1.1},
    ['rotation'] =  {0, 0, 0},
    ['scale'] = {0.7,1,0.7},
    ['width'] = 900,
    ['height'] = 200,
    ['font_size'] = 100,
    ['color'] = {buttonRed, buttonGreen, buttonBlue},
    ['font_color'] = "White"
  })
  self.createButton ({
    ['click_function'] = 'twoPlayerPage',
    ['label'] = 'Two-Player Game',
    ['function_owner'] = self,
    ['position'] = {-2.7, 0.3, 1.4},
    ['rotation'] =  {0, 0, 0},
    ['scale'] = {0.7,1,0.7},
    ['width'] = 900,
    ['height'] = 200,
    ['font_size'] = 100,
    ['color'] = {buttonRed, buttonGreen, buttonBlue},
    ['font_color'] = "White"
  })
  self.createButton ({
    ['click_function'] = 'soloPage',
    ['label'] = 'Solo Game',
    ['function_owner'] = self,
    ['position'] = {-2.7, 0.3, 1.7},
    ['rotation'] =  {0, 0, 0},
    ['scale'] = {0.7,1,0.7},
    ['width'] = 900,
    ['height'] = 200,
    ['font_size'] = 100,
    ['color'] = {buttonRed, buttonGreen, buttonBlue},
    ['font_color'] = "White"
  })
end

function setupPage()
  getObjectFromGUID("9ac7d6").book.setPage(3)
end

function overviewPage()
  getObjectFromGUID("9ac7d6").book.setPage(5)
end

function gameplayPage()
  getObjectFromGUID("9ac7d6").book.setPage(7)
end

function agentPage()
  getObjectFromGUID("9ac7d6").book.setPage(8)
end

function revealPage()
  getObjectFromGUID("9ac7d6").book.setPage(10)
end

function combatPage()
  getObjectFromGUID("9ac7d6").book.setPage(11)
end

function makersRecallPage()
  getObjectFromGUID("9ac7d6").book.setPage(12)
end

function strategyPage()
  getObjectFromGUID("9ac7d6").book.setPage(13)
end

function referencePage()
  getObjectFromGUID("9ac7d6").book.setPage(15)
end

function boardPage()
  getObjectFromGUID("9ac7d6").book.setPage(16)
end

function twoPlayerPage()
  getObjectFromGUID("9ac7d6").book.setPage(18)
end

function soloPage()
  getObjectFromGUID("9ac7d6").book.setPage(19)
end

-- ===== Troop Supply c494c8 (2424 chars) =====
--Counting Bowl    by MrStump
timerID = ""

validCountItemList = {
    ["Blue"] = 1,
}

function onLoad()
    timerID = self.getGUID()..math.random(9999999999999)
    
    self.createButton({
        label="", click_function="none", function_owner=self,
        position={0,1.4,-1.8}, rotation={0,180,0}, height=00, width=0,
        font_color={1,1,1}, font_size=250
    })
    
    Timer.create({
        identifier=timerID,
        function_name="countItems", function_owner=self,
        repetitions=0, delay=0.75
    })
end

--Activated once per second, counts items in bowls
function countItems()
    local totalValue = 0
    local itemsInBowl = findItemsInSphere()
    --Go through all items found by the cast
    for _, entry in ipairs(itemsInBowl) do
        --Ignore the bowl
        if entry.hit_object ~= self then
            local tableEntry = validCountItemList[entry.hit_object.getName()]
            --Ignore if not in validCountItemList
            if tableEntry ~= nil then
                local descValue = tonumber(entry.hit_object.getDescription())
                local stackMult = math.abs(entry.hit_object.getQuantity())
                --Use value in description if available
                if descValue ~= nil then
                    totalValue = totalValue + descValue * stackMult
                else
                    --Otherwise use the value in validCountItemList
                    totalValue = totalValue + tableEntry * stackMult
                end
            end
        end
    end
    --Updates the number display
    if totalValue == 1 then 
      totalValue = (totalValue .. " Troop")
    elseif totalValue > 1 then
      totalValue = (totalValue .. " Troops")
    elseif totalValue == 0 then
      totalValue = ("0 Troops")
    end
    self.editButton({index=0, label=totalValue})
end

--Gets the items in the bowl for countItems to count
function findItemsInSphere()
    --Find scaling factor
    local scale = self.getScale()
    --Set position for the sphere
    local pos = self.getPosition()
    pos.y=pos.y+(1.25*scale.y)
    --Ray trace to get all objects
    return Physics.cast({
        origin=pos, direction={0,1,0}, type=2, max_distance=0,
        size={3.4*scale.x,3.4*scale.y,3.4*scale.z}, --debug=true
    })
end

function onDestroy()
  --if timerID ~= nil then
    --Timer.destroy(timerID)
  --end
end

-- ===== Custom_Board 042887 (20728 chars) =====
discardZone = "899024"
drawDeckZone = "6a6014"
supplyZone = "58f84d"
garrisonZone = "d05f48"
drawSpot = {-19.61, 3, -12.89}
starterDeckZone = "6a6014"
boardColor = "Blue"
playerBoard = "9b4f33"
intrigueZone = "e9f30d"
revealButton = "096653"
revealArea = "46e48b"
firstPlayerToken = "784534"

solarisFiveBag = "3f6168"
solarisOneBag = "5090e6"
waterBag = "400db5"
spiceFiveBag = "3d38e5"
spiceOneBag = "85289a"

solarisBowl = {-6.00, 3.5, -13.00}
waterBowl = {-6.00, 3.5, -16.00}
spiceBowl = {-6.00, 3.5, -19.00}

function boardSetup()
  buttonRed = 0
  buttonGreen = 95
  buttonBlue = 200

  buttonRed = buttonRed/255
  buttonGreen = buttonGreen/255
  buttonBlue = buttonBlue/255

  self.clearButtons()
  self.createButton ({
    ['click_function'] = 'reshuffleDiscard',
    ['label'] = 'Reshuffle Discard',
    ['function_owner'] = self,
    ['position'] = {5.58, 0.9, -3.0},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 1200,
    ['height'] = 250,
    ['font_size'] = 100,
    ['color'] = {buttonRed, buttonGreen, buttonBlue},
    ['font_color'] = "White"
  })
  self.createButton ({
    ['click_function'] = 'discardReveals',
    ['label'] = 'Discard Revealed Cards',
    ['function_owner'] = self,
    ['position'] = {5.58, 0.9, -2.25},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 1200,
    ['height'] = 250,
    ['font_size'] = 100,
    ['color'] = {0,0,0},
    ['font_color'] = "White"
  })
  self.createButton ({
    ['click_function'] = 'drawHandStart',
    ['label'] = 'Draw 5 Cards',
    ['function_owner'] = self,
    ['position'] = {-5.58, 0.9, -3.0},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 1200,
    ['height'] = 250,
    ['font_size'] = 100,
    ['color'] = {buttonRed, buttonGreen, buttonBlue},
    ['font_color'] = "White"
  })
  self.createButton ({
    ['click_function'] = 'drawCard',
    ['label'] = 'Draw 1 Card',
    ['function_owner'] = self,
    ['position'] = {-5.58, 0.9, -2.25},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 1200,
    ['height'] = 250,
    ['font_size'] = 100,
    ['color'] = {buttonRed, buttonGreen, buttonBlue},
    ['font_color'] = "White"
  })

  buttonRed = 255
  buttonGreen = 084
  buttonBlue = 0

  buttonRed = buttonRed/255
  buttonGreen = buttonGreen/255
  buttonBlue = buttonBlue/255

  self.createButton ({
    ['click_function'] = 'spendFiveSpice',
    ['label'] = 'Spend 5 Spice',
    ['function_owner'] = self,
    ['position'] = {3.25, 0.9, 7.75},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 1200,
    ['height'] = 250,
    ['font_size'] = 100,
    ['color'] = {buttonRed, buttonGreen, buttonBlue},
    ['font_color'] = "White"
  })
  self.createButton ({
    ['click_function'] = 'spendOneSpice',
    ['label'] = 'Spend 1 Spice',
    ['function_owner'] = self,
    ['position'] = {3.25, 0.9, 7},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 1200,
    ['height'] = 250,
    ['font_size'] = 100,
    ['color'] = {buttonRed, buttonGreen, buttonBlue},
    ['font_color'] = "White"
  })

  buttonRed = 0
  buttonGreen = 153
  buttonBlue = 255

  buttonRed = buttonRed/255
  buttonGreen = buttonGreen/255
  buttonBlue = buttonBlue/255

  self.createButton ({
    ['click_function'] = 'spendWater',
    ['label'] = 'Spend 1 Water',
    ['function_owner'] = self,
    ['position'] = {-0.15, 0.9, 7},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 1200,
    ['height'] = 250,
    ['font_size'] = 100,
    ['color'] = {buttonRed, buttonGreen, buttonBlue},
    ['font_color'] = "White"
  })

  if getObjectFromGUID(firstPlayerToken).getVar("riseIX") == 1 then
    buttonRed = 25
    buttonGreen = 62
    buttonBlue = 52

    buttonRed = buttonRed/255
    buttonGreen = buttonGreen/255
    buttonBlue = buttonBlue/255

    self.createButton ({
      ['click_function'] = 'sendNegotiator',
      ['label'] = 'Send 1 Negotiator',
      ['function_owner'] = self,
      ['position'] = {-0.15, 0.9, 7.75},
      ['rotation'] =  {0, 0, 0},
      ['width'] = 1200,
      ['height'] = 250,
      ['font_size'] = 100,
      ['color'] = {buttonRed, buttonGreen, buttonBlue},
      ['font_color'] = "White"
    })
  end

  buttonRed = 128
  buttonGreen = 128
  buttonBlue = 128

  buttonRed = buttonRed/255
  buttonGreen = buttonGreen/255
  buttonBlue = buttonBlue/255

  self.createButton ({
    ['click_function'] = 'spendOneSolaris',
    ['label'] = 'Spend 1 Solaris',
    ['function_owner'] = self,
    ['position'] = {-3.5, 0.9, 7},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 1200,
    ['height'] = 250,
    ['font_size'] = 100,
    ['color'] = {buttonRed, buttonGreen, buttonBlue},
    ['font_color'] = "White"
  })
  self.createButton ({
    ['click_function'] = 'spendFiveSolaris',
    ['label'] = 'Spend 5 Solaris',
    ['function_owner'] = self,
    ['position'] = {-3.5, 0.9, 7.75},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 1200,
    ['height'] = 250,
    ['font_size'] = 100,
    ['color'] = {buttonRed, buttonGreen, buttonBlue},
    ['font_color'] = "White"
  })

  buttonRed = 0
  buttonGreen = 95
  buttonBlue = 200

  buttonRed = buttonRed/255
  buttonGreen = buttonGreen/255
  buttonBlue = buttonBlue/255

  self.createButton ({
    ['click_function'] = 'addGarrison',
    ['label'] = 'Add 1 to Garrison',
    ['function_owner'] = self,
    ['position'] = {6.80, 0.9, 7},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 1200,
    ['height'] = 250,
    ['font_size'] = 100,
    ['color'] = {buttonRed, buttonGreen, buttonBlue},
    ['font_color'] = "White"
  })
  self.createButton ({
    ['click_function'] = 'addConflict',
    ['label'] = 'Add 1 to Conflict Area',
    ['function_owner'] = self,
    ['position'] = {6.80, 0.9, 7.75},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 1200,
    ['height'] = 250,
    ['font_size'] = 100,
    ['color'] = {buttonRed, buttonGreen, buttonBlue},
    ['font_color'] = "White"
  })
end

function reshuffleDiscard()
  discardArea = GetDeckOrCard(discardZone)

  if discardArea != nil then

  discardArea.flip()
  discardArea.shuffle()
  discardArea.setPositionSmooth(drawSpot, false, true)

  Wait.frames(function()
   drawDeck = GetDeckOrCard(drawDeckZone)
   drawDeck.shuffle()
   drawDeck.shuffle()
  end, 60)

  end
end

function drawHandStart()
  startLuaCoroutine(self, "drawHand")
end

function drawHand()
  ::DrawStart::
  local starterDeck = GetDeckOrCard(starterDeckZone)
  local countCheck = 0
  local tagCheck = ""
  local drawCount = 0

  if starterDeck != nil then
   for i=1, 5 do
     if starterDeck != nil then
       countCheck = starterDeck.getQuantity()
       tagCheck = starterDeck.tag
     end

    if countCheck > 0 and tagCheck == "Deck" then
      if starterDeck != nil then
        starterDeck.deal(1, boardColor)
        drawCount = drawCount + 1
        starterDeck = GetDeckOrCard(starterDeckZone)
      end
    else
      if starterDeck != nil then
        starterDeck.deal(1, boardColor)
        drawCount = drawCount + 1
        if drawCount < 5 then
          reshuffleDiscard()
        end

        local Time = os.clock() + 2.0
          while os.clock() < Time do
            coroutine.yield(0)
          end

        starterDeck = GetDeckOrCard(starterDeckZone)
      end
    end
  end
 else
   reshuffleDiscard()

   local Time = os.clock() + 2.0
     while os.clock() < Time do
       coroutine.yield(0)
     end
   goto DrawStart
 end

  return 1
end

function drawCard()
  startLuaCoroutine(self, "drawCardRevised")
end

function drawCardRevised()
  ::DrawStart::
  local starterDeck = GetDeckOrCard(starterDeckZone)

  if starterDeck != nil then
    if starterDeck.getQuantity() > 0 then
      if starterDeck != nil then
        starterDeck.deal(1, boardColor)
        starterDeck = GetDeckOrCard(starterDeckZone)
      end
    else
      if starterDeck != nil then
        starterDeck.deal(1, boardColor)
        --reshuffleDiscard()
      end
    end
  else
    reshuffleDiscard()

    local Time = os.clock() + 2.0
      while os.clock() < Time do
        coroutine.yield(0)
        end
      goto DrawStart
  end

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

function spendOneSpice()
  local items = getObjectFromGUID(playerBoard).getObjects()
  local check = 0

  for _, item in ipairs(items) do
    if item.getName() == "1 Spice" then
      getObjectFromGUID("9f81fa").putObject(item)
      check = 1
      break
    end
  end

  if check == 0 then
   for _, item in ipairs(items) do
    if item.getName() == "5 Spice" then
      getObjectFromGUID("9f81fa").putObject(item)

      params = {"", "Blue"}
      getObjectFromGUID(spiceOneBag).call("makeSpiceStart", params)

      check = 1
      break
    end
   end
  end

  if check == 0 then
    if Player["Blue"].seated then
    printToColor("No 1 Spice Available!", "Blue")
    end
  end
end

function spendFiveSpice()
  local items = getObjectFromGUID(playerBoard).getObjects()
  local check = 0

  for _, item in ipairs(items) do
    if item.getName() == "5 Spice" then
      getObjectFromGUID("9f81fa").putObject(item)
      check = 1
      break
    end
  end

  local fiveCount = 0

  for _, item in ipairs(items) do
    if item.getName() == "1 Spice" then
      fiveCount = fiveCount + 1
    end
  end

  if fiveCount > 4 and check == 0 then
    check = 1
    local countDown= 5
    for _, item in ipairs(items) do
      if item.getName() == "1 Spice" then
        getObjectFromGUID(spiceOneBag).putObject(item)
        countDown = countDown - 1
        if countDown == 0 then
          break
        end
      end
    end
  end

  if check == 0 then
    if Player["Blue"].seated then
    printToColor("No 5 Spice Available!", "Blue")
    end
  end
end

function spendWater()
  local items = getObjectFromGUID(playerBoard).getObjects()
  local check = 0

  for _, item in ipairs(items) do
    if item.getName() == "Water" and item.tag == "Tile" then
      getObjectFromGUID(waterBag).putObject(item)
      check = 1
      break
    end
  end

  if check == 0 then
    if Player["Blue"].seated then
    printToColor("No Water Available!", "Blue")
    end
  end

end

function spendOneSolaris()
  local items = getObjectFromGUID(playerBoard).getObjects()
  local check = 0

  for _, item in ipairs(items) do
    if item.getName() == "1 Solaris" then
      getObjectFromGUID(solarisOneBag).putObject(item)
      check = 1
      break
    end
  end

  if check == 0 then
   for _, item in ipairs(items) do
    if item.getName() == "5 Solaris" then
      getObjectFromGUID(solarisFiveBag).putObject(item)

      params = {"", "Blue"}
      getObjectFromGUID(solarisOneBag).call("makeSolarisStart", params)

      check = 1
      break
    end
   end
  end

  if check == 0 then
    if Player["Blue"].seated then
    printToColor("No 1 Solaris Available!", "Blue")
    end
  end
end

function spendFiveSolaris()
  local items = getObjectFromGUID(playerBoard).getObjects()
  local check = 0

  for _, item in ipairs(items) do
    if item.getName() == "5 Solaris" then
      getObjectFromGUID(solarisFiveBag).putObject(item)
      check = 1
      break
    end
  end

  local fiveCount = 0

  for _, item in ipairs(items) do
    if item.getName() == "1 Solaris" then
      fiveCount = fiveCount + 1
    end
  end

  if fiveCount > 4 and check == 0 then
    check = 1
    local countDown= 5
    for _, item in ipairs(items) do
      if item.getName() == "1 Solaris" then
        getObjectFromGUID(solarisOneBag).putObject(item)
        countDown = countDown - 1
        if countDown == 0 then
          break
        end
      end
    end
  end

  if check == 0 then
    if Player["Blue"].seated then
    printToColor("No 5 Solaris Available!", "Blue")
    end
  end
end

function addGarrison()
  math.randomseed(os.time())
  local items = getObjectFromGUID(supplyZone).getObjects()
  for _, item in ipairs(items) do
    if item.getName() == "Blue" and item.tag == "Block" then
      item.setPositionSmooth({math.random(1,3),2, (-math.random(3,4) - 0.35)},false,true)
      item.setRotationSmooth({0,0,0})
      break
    end
  end
end

function addDreadnought()
  math.randomseed(os.time())
  local items = getObjectFromGUID(playerBoard).getObjects()
  for _, item in ipairs(items) do
    if item.getName() == "Blue Dreadnought" then
      item.setPositionSmooth({math.random(1,3),2, (-math.random(3,4) - 0.35)},false,true)
      item.setRotationSmooth({0,180,0})
      break
    end
  end
end

function addDreadConflict()
  local dreadCheck = 0
  math.randomseed(os.time())
  local items = getObjectFromGUID(garrisonZone).getObjects()
  for _, item in ipairs(items) do
    if item.getName() == "Blue Dreadnought" then
      item.setPositionSmooth({(math.random(4,5) + 0.4),2, (-math.random(4,5) - 0.2)},false,true)
      item.setRotationSmooth({0,180,0})
      dreadCheck = 1
      break
    end
  end
  if dreadCheck == 0 then
    return 0
  else
    return 1
  end
end

function addConflict()
  math.randomseed(os.time())
  local items = getObjectFromGUID(garrisonZone).getObjects()
  for _, item in ipairs(items) do
    if item.getName() == "Blue" and item.tag == "Block" then
      item.setPositionSmooth({(math.random(4,5) + 0.4),2, (-math.random(4,5) - 0.2)},false,true)
      item.setRotationSmooth({0,0,0})
      break
    end
  end
end

function sendNegotiator()
  math.randomseed(os.time())
  local items = getObjectFromGUID(supplyZone).getObjects()
  for _, item in ipairs(items) do
    if item.getName() == "Blue" and item.tag == "Block" then
      item.setPositionSmooth({(math.random(16,17) + 0.45), 2, (math.random(7,9) + 0.25)},false,true)
      item.setRotationSmooth({0,0,0})
      broadcastToAll("Blue Player sent a Negotiator to IX", stringColorToRGB("Blue"))
      break
    end
  end
end

function sendSpecimen()
  math.randomseed(os.time())
  local adjustValueX = ((math.random(1,6)) / 10)
  local adjustValueZ = ((math.random(1,6)) / 10)
  local items = getObjectFromGUID(supplyZone).getObjects()
  for _, item in ipairs(items) do
    if item.getName() == "Blue" and item.tag == "Block" then
      item.setPositionSmooth({(math.random(2,4) + adjustValueX), 13, (math.random(21,22) + adjustValueZ)},false,true)
      item.setRotationSmooth({0,0,0})
      broadcastToAll("Blue Player sent a Specimen to the Axolotl Tanks", stringColorToRGB("Blue"))
      break
    end
  end
end

function rivalSetup()
  buttonIndex = ""
  buttons = {}

  buttons = self.getButtons()
  if buttons != nil then
    for i, v in pairs(buttons) do
      if v.label == "Draw 5 Cards" then
        buttonIndexOne = i-1
      end
    end
  end
  self.removeButton(buttonIndexOne)

  buttons = self.getButtons()
  if buttons != nil then
    for i, v in pairs(buttons) do
      if v.label == "Draw 1 Card" then
        buttonIndexTwo = i-1
      end
    end
  end
  self.removeButton(buttonIndexTwo)

  buttons = self.getButtons()
  if buttons != nil then
    for i, v in pairs(buttons) do
      if v.label == "Reshuffle Discard" then
        buttonIndexThree = i-1
      end
    end
  end
  self.removeButton(buttonIndexThree)

  buttons = self.getButtons()
  if buttons != nil then
    for i, v in pairs(buttons) do
      if v.label == "Discard Revealed Cards" then
        buttonIndexFour = i-1
      end
    end
  end
  self.removeButton(buttonIndexFour)
end

function rivalButtons()
  buttonRed = 255
  buttonGreen = 084
  buttonBlue = 0

  buttonRed = buttonRed/255
  buttonGreen = buttonGreen/255
  buttonBlue = buttonBlue/255

  self.createButton ({
    ['click_function'] = 'takeOneSpice',
    ['label'] = 'Take 1 Spice',
    ['function_owner'] = self,
    ['position'] = {3.25, 0.9, 6},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 1200,
    ['height'] = 250,
    ['font_size'] = 100,
    ['color'] = {buttonRed, buttonGreen, buttonBlue},
    ['font_color'] = "White"
  })

  buttonRed = 0
  buttonGreen = 153
  buttonBlue = 255

  buttonRed = buttonRed/255
  buttonGreen = buttonGreen/255
  buttonBlue = buttonBlue/255

  self.createButton ({
    ['click_function'] = 'takeWater',
    ['label'] = 'Take 1 Water',
    ['function_owner'] = self,
    ['position'] = {-0.15, 0.9, 6},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 1200,
    ['height'] = 250,
    ['font_size'] = 100,
    ['color'] = {buttonRed, buttonGreen, buttonBlue},
    ['font_color'] = "White"
  })

  buttonRed = 128
  buttonGreen = 128
  buttonBlue = 128

  buttonRed = buttonRed/255
  buttonGreen = buttonGreen/255
  buttonBlue = buttonBlue/255

  self.createButton ({
    ['click_function'] = 'takeOneSolaris',
    ['label'] = 'Take 1 Solaris',
    ['function_owner'] = self,
    ['position'] = {-3.5, 0.9, 6},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 1200,
    ['height'] = 250,
    ['font_size'] = 100,
    ['color'] = {buttonRed, buttonGreen, buttonBlue},
    ['font_color'] = "White"
  })

  self.createButton ({
    ['click_function'] = 'drawIntrigue',
    ['label'] = 'Draw 1 Intrigue Card',
    ['function_owner'] = self,
    ['position'] = {-5.58, 0.9, -3.0},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 1200,
    ['height'] = 250,
    ['font_size'] = 100,
    ['color'] = {0,0,0},
    ['font_color'] = "Yellow"
  })
end

function takeOneSpice()
  getObjectFromGUID(spiceOneBag).takeObject({position = spiceBowl, rotation = {0,180,0}})
end

function takeWater()
  getObjectFromGUID(waterBag).takeObject({position = waterBowl, rotation = {0,180,0}})
end

function takeOneSolaris()
  getObjectFromGUID(solarisOneBag).takeObject({position = solarisBowl, rotation = {0,180,0}})
end

function drawIntrigue()
  local intrigueDeck = GetDeckOrCard(intrigueZone)
  local deckPos = getObjectFromGUID(drawDeckZone).getPosition()
  deckPos.y = 2
  if intrigueDeck.name == "Deck" or intrigueDeck.name == "DeckCustom" then
    local cardPull = intrigueDeck.takeObject({position = deckPos, flip = false})
  elseif intrigueDeck.name == "Card" or intrigueDeck.name == "CardCustom" then
    cardPull = intrigueDeck
    local cardPull = intrigueDeck.takeObject({position = deckPos, flip = false})
  end
end

function discardIntrigue()
  playerHand = Player["Blue"].getHandObjects()
  for _, obj in ipairs(playerHand) do
    local scale = obj.getScale()
    if round(scale.x,2) == 0.88 and round(scale.z,2) == 0.88 then
      if obj.getDescription() == "Intrigue" then
        obj.setPosition({-18.00, 2.00, 17.81})
        obj.setRotation({0.00, 180.00, 180.00})
        break
      end
    end
  end
end

function discardIntrigueRival()
  local intriguePile = GetDeckOrCard("6a6014")
  if intriguePile != nil then
    if intriguePile.name == "Card" or intriguePile.name == "CardCustom" then
      intriguePile.setPositionSmooth({-18.00, 2.00, 17.81}, false, true)
      intriguePile.setRotation({0.00, 180.00, 180.00})
    elseif intriguePile.name == "Deck" or intriguePile.name == "DeckCustom" then
      local objPull = intriguePile.takeObject()
      objPull.setPositionSmooth({-18.00, 2.00, 17.81}, false, true)
      objPull.setRotation({0.00, 180.00, 180.00})
    end
  end
end

function onObjectEnterScriptingZone(zone,obj)
  if zone.getGUID() == drawDeckZone and Global.getVar("rivals")[2] == 1 then
   if obj.name == "Card" or obj.name == "CardCustom" then
    local scaleCheck = obj.getScale()
    if round(scaleCheck.x,2) == 0.88 then
     local vpCheck = 0
     Wait.frames(function()
      local deckCheck = GetDeckOrCard(drawDeckZone)
      if deckCheck != nil then
        if vpCheck == 0 and deckCheck.name == "Deck" or deckCheck.name == "DeckCustom" then
          if deckCheck.getQuantity() == 3 then
            vpCheck = 1
            deckCheck.setPositionSmooth({-18.00, 3.00, 17.81}, false, true)
            getObjectFromGUID("2da390").call("upBlue",{})
          end
        end
      end
     end,60)
   end
   end
  end
end

function discardReveals()
  local discardRevealPos = getObjectFromGUID(discardZone).getPosition()
  local revealCards = getObjectFromGUID(revealButton).getVar("revealedCards")
  local revealAreaItems = getObjectFromGUID(revealArea).getObjects()

  discardRevealPos.y = 2

  for _, cardR in ipairs(revealCards) do
    if getObjectFromGUID(cardR) then
      getObjectFromGUID(cardR).setPositionSmooth(discardRevealPos,false,true)
    end
  end

  getObjectFromGUID(revealButton).call("resetReveal",{})

  for _, itemR in ipairs (revealAreaItems) do
    if itemR.tag == "Card" or itemR.tag == "CardCustom" or itemR.tag == "Deck" or itemR.tag == "DeckCustom" then
      itemR.setPositionSmooth(discardRevealPos,false,true)
    end
  end
end

function round(num, dec)
  local mult = 10^(dec or 0)
  return math.floor(num * mult + 0.5) / mult
end

-- ===== The Beast 4cf050 (1910 chars) =====
function onLoad()
  if Vector.equals(self.getPosition(), Vector({-24.00, 1.08, 22.80}), 0.02) then
  self.createButton({
     click_function = "claimLeader",
     function_owner = self,
     label          = "Claim Leader",
     position       = {0,0.2,0.4},
     rotation       = {0, 0, 0},
     scale          = {0.5, 1, 0.5},
     width          = 700,
     height         = 150,
     tooltip        = "",
     font_color     = {1, 1, 1},
     font_size      = 85,
     color          = "Black"
     })
  end
end 
	 
function claimLabel()
  self.createButton({
     click_function = "claimLeader",
     function_owner = self,
     label          = "Claim Leader",
     position       = {0,0.2,0.4},
     rotation       = {0, 0, 0},
     scale          = {0.5, 1, 0.5},
     width          = 700,
     height         = 150,
     tooltip        = "",
     font_color     = {1, 1, 1},
     font_size      = 85,
     color          = "Black"
     })
end

function claimLeader(GO, color)
  if color == "Red" then
    leaderPos = {-40.00, 2, -12.89}
    leaderRot = {0.00, 180.00, 0.00}
    GO.setPositionSmooth(leaderPos)
    GO.setRotationSmooth(leaderRot)
    GO.clearButtons()
  elseif color == "Blue" then
    leaderPos = {-15.00, 2, -12.89}
    leaderRot = {0.00, 180.00, 0.00}
    GO.setPositionSmooth(leaderPos)
    GO.setRotationSmooth(leaderRot)
    GO.clearButtons()
  elseif color == "Orange" then
    leaderPos = {15.00, 2, -12.89}
    leaderRot = {0.00, 180.00, 0.00}
    GO.setPositionSmooth(leaderPos)
    GO.setRotationSmooth(leaderRot)
    GO.clearButtons()
  elseif color == "Green" then
    leaderPos = {40.00, 2, -12.89}
    leaderRot = {0.00, 180.00, 0.00}
    GO.setPositionSmooth(leaderPos)
    GO.setRotationSmooth(leaderRot)
    GO.clearButtons()
  else
    printToAll("Cannot Select Leader Until the Player is Seated!")
  end
end

-- ===== Card 4bb849 (2132 chars) =====
function onLoad()
   self.clearButtons()
   self.createButton({
    ['click_function'] = 'trashConfirm',
    ['label'] = 'Trash the Card?',
    ['function_owner'] = self,
    ['position'] = {0, 0.2, 0.3},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 800,
    ['height'] = 200,
    ['scale'] = {0.9,0.9,0.9},
    ['font_size'] = 75,
    ['font_color'] = {1, 1, 1}
,
    ['color'] = {0,0,0}
   })
end

function trashConfirm()
   self.clearButtons()
   self.createButton({
    ['click_function'] = 'doNothing',
    ['label'] = 'Are You Sure?',
    ['function_owner'] = self,
    ['position'] = {0, 0.2, 0.3},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 800,
    ['height'] = 200,
    ['scale'] = {0.9,0.9,0.9},
    ['font_size'] = 75,
    ['font_color'] = {1, 1, 1}
,
    ['color'] = {0,0,0}
   })
   self.createButton({
    ['click_function'] = 'trashCard',
    ['label'] = 'Yes',
    ['function_owner'] = self,
    ['position'] = {-0.2, 0.2, 0.6},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 150,
    ['height'] = 100,
    ['scale'] = {0.9,0.9,0.9},
    ['font_size'] = 75,
    ['font_color'] = {1, 1, 1}
,
    ['color'] = "Green"
   })
   self.createButton({
    ['click_function'] = 'holdCard',
    ['label'] = 'No',
    ['function_owner'] = self,
    ['position'] = {0.2, 0.2, 0.6},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 150,
    ['height'] = 100,
    ['scale'] = {0.9,0.9,0.9},
    ['font_size'] = 75,
    ['font_color'] = {1, 1, 1}
,
    ['color'] = "Red"
   })
end

function holdCard()
   self.clearButtons()
   self.createButton({
    ['click_function'] = 'trashConfirm',
    ['label'] = 'Trash the Card?',
    ['function_owner'] = self,
    ['position'] = {0, 0.2, 0.3},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 800,
    ['height'] = 200,
    ['scale'] = {0.9,0.9,0.9},
    ['font_size'] = 75,
    ['font_color'] = {1, 1, 1}
,
    ['color'] = {0,0,0}
   })
end

function trashCard()
  self.clearButtons()
  getObjectFromGUID("288283").putObject(self)
  broadcastToAll("Card Trashed")
end

function doNothing()
end

-- ===== Card dc018d (2132 chars) =====
function onLoad()
   self.clearButtons()
   self.createButton({
    ['click_function'] = 'trashConfirm',
    ['label'] = 'Trash the Card?',
    ['function_owner'] = self,
    ['position'] = {0, 0.2, 0.3},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 800,
    ['height'] = 200,
    ['scale'] = {0.9,0.9,0.9},
    ['font_size'] = 75,
    ['font_color'] = {1, 1, 1}
,
    ['color'] = {0,0,0}
   })
end

function trashConfirm()
   self.clearButtons()
   self.createButton({
    ['click_function'] = 'doNothing',
    ['label'] = 'Are You Sure?',
    ['function_owner'] = self,
    ['position'] = {0, 0.2, 0.3},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 800,
    ['height'] = 200,
    ['scale'] = {0.9,0.9,0.9},
    ['font_size'] = 75,
    ['font_color'] = {1, 1, 1}
,
    ['color'] = {0,0,0}
   })
   self.createButton({
    ['click_function'] = 'trashCard',
    ['label'] = 'Yes',
    ['function_owner'] = self,
    ['position'] = {-0.2, 0.2, 0.6},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 150,
    ['height'] = 100,
    ['scale'] = {0.9,0.9,0.9},
    ['font_size'] = 75,
    ['font_color'] = {1, 1, 1}
,
    ['color'] = "Green"
   })
   self.createButton({
    ['click_function'] = 'holdCard',
    ['label'] = 'No',
    ['function_owner'] = self,
    ['position'] = {0.2, 0.2, 0.6},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 150,
    ['height'] = 100,
    ['scale'] = {0.9,0.9,0.9},
    ['font_size'] = 75,
    ['font_color'] = {1, 1, 1}
,
    ['color'] = "Red"
   })
end

function holdCard()
   self.clearButtons()
   self.createButton({
    ['click_function'] = 'trashConfirm',
    ['label'] = 'Trash the Card?',
    ['function_owner'] = self,
    ['position'] = {0, 0.2, 0.3},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 800,
    ['height'] = 200,
    ['scale'] = {0.9,0.9,0.9},
    ['font_size'] = 75,
    ['font_color'] = {1, 1, 1}
,
    ['color'] = {0,0,0}
   })
end

function trashCard()
  self.clearButtons()
  getObjectFromGUID("288283").putObject(self)
  broadcastToAll("Card Trashed")
end

function doNothing()
end

-- ===== Card 7f2695 (2132 chars) =====
function onLoad()
   self.clearButtons()
   self.createButton({
    ['click_function'] = 'trashConfirm',
    ['label'] = 'Trash the Card?',
    ['function_owner'] = self,
    ['position'] = {0, 0.2, 0.3},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 800,
    ['height'] = 200,
    ['scale'] = {0.9,0.9,0.9},
    ['font_size'] = 75,
    ['font_color'] = {1, 1, 1}
,
    ['color'] = {0,0,0}
   })
end

function trashConfirm()
   self.clearButtons()
   self.createButton({
    ['click_function'] = 'doNothing',
    ['label'] = 'Are You Sure?',
    ['function_owner'] = self,
    ['position'] = {0, 0.2, 0.3},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 800,
    ['height'] = 200,
    ['scale'] = {0.9,0.9,0.9},
    ['font_size'] = 75,
    ['font_color'] = {1, 1, 1}
,
    ['color'] = {0,0,0}
   })
   self.createButton({
    ['click_function'] = 'trashCard',
    ['label'] = 'Yes',
    ['function_owner'] = self,
    ['position'] = {-0.2, 0.2, 0.6},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 150,
    ['height'] = 100,
    ['scale'] = {0.9,0.9,0.9},
    ['font_size'] = 75,
    ['font_color'] = {1, 1, 1}
,
    ['color'] = "Green"
   })
   self.createButton({
    ['click_function'] = 'holdCard',
    ['label'] = 'No',
    ['function_owner'] = self,
    ['position'] = {0.2, 0.2, 0.6},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 150,
    ['height'] = 100,
    ['scale'] = {0.9,0.9,0.9},
    ['font_size'] = 75,
    ['font_color'] = {1, 1, 1}
,
    ['color'] = "Red"
   })
end

function holdCard()
   self.clearButtons()
   self.createButton({
    ['click_function'] = 'trashConfirm',
    ['label'] = 'Trash the Card?',
    ['function_owner'] = self,
    ['position'] = {0, 0.2, 0.3},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 800,
    ['height'] = 200,
    ['scale'] = {0.9,0.9,0.9},
    ['font_size'] = 75,
    ['font_color'] = {1, 1, 1}
,
    ['color'] = {0,0,0}
   })
end

function trashCard()
  self.clearButtons()
  getObjectFromGUID("288283").putObject(self)
  broadcastToAll("Card Trashed")
end

function doNothing()
end

-- ===== Card fac919 (2132 chars) =====
function onLoad()
   self.clearButtons()
   self.createButton({
    ['click_function'] = 'trashConfirm',
    ['label'] = 'Trash the Card?',
    ['function_owner'] = self,
    ['position'] = {0, 0.2, 0.3},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 800,
    ['height'] = 200,
    ['scale'] = {0.9,0.9,0.9},
    ['font_size'] = 75,
    ['font_color'] = {1, 1, 1}
,
    ['color'] = {0,0,0}
   })
end

function trashConfirm()
   self.clearButtons()
   self.createButton({
    ['click_function'] = 'doNothing',
    ['label'] = 'Are You Sure?',
    ['function_owner'] = self,
    ['position'] = {0, 0.2, 0.3},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 800,
    ['height'] = 200,
    ['scale'] = {0.9,0.9,0.9},
    ['font_size'] = 75,
    ['font_color'] = {1, 1, 1}
,
    ['color'] = {0,0,0}
   })
   self.createButton({
    ['click_function'] = 'trashCard',
    ['label'] = 'Yes',
    ['function_owner'] = self,
    ['position'] = {-0.2, 0.2, 0.6},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 150,
    ['height'] = 100,
    ['scale'] = {0.9,0.9,0.9},
    ['font_size'] = 75,
    ['font_color'] = {1, 1, 1}
,
    ['color'] = "Green"
   })
   self.createButton({
    ['click_function'] = 'holdCard',
    ['label'] = 'No',
    ['function_owner'] = self,
    ['position'] = {0.2, 0.2, 0.6},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 150,
    ['height'] = 100,
    ['scale'] = {0.9,0.9,0.9},
    ['font_size'] = 75,
    ['font_color'] = {1, 1, 1}
,
    ['color'] = "Red"
   })
end

function holdCard()
   self.clearButtons()
   self.createButton({
    ['click_function'] = 'trashConfirm',
    ['label'] = 'Trash the Card?',
    ['function_owner'] = self,
    ['position'] = {0, 0.2, 0.3},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 800,
    ['height'] = 200,
    ['scale'] = {0.9,0.9,0.9},
    ['font_size'] = 75,
    ['font_color'] = {1, 1, 1}
,
    ['color'] = {0,0,0}
   })
end

function trashCard()
  self.clearButtons()
  getObjectFromGUID("288283").putObject(self)
  broadcastToAll("Card Trashed")
end

function doNothing()
end

-- ===== Custom_Board e435ab (20734 chars) =====
discardZone = "86177c"
drawDeckZone = "4a4d87"
supplyZone = "e7685b"
garrisonZone = "f7ba73"
drawSpot = {10.39, 3, -12.89}
starterDeckZone = "4a4d87"
boardColor = "Orange"
playerBoard = "bd5bf6"
intrigueZone = "e9f30d"
revealButton = "922131"
revealArea = "dc1de0"
firstPlayerToken = "784534"

solarisFiveBag = "3f6168"
solarisOneBag = "5090e6"
waterBag = "400db5"
spiceFiveBag = "3d38e5"
spiceOneBag = "85289a"

solarisBowl = {6.00, 3.5, -13.00}
waterBowl = {6.00, 3.5, -16.00}
spiceBowl = {6.00, 3.5, -19.00}

function boardSetup()
  buttonRed = 200
  buttonGreen = 90
  buttonBlue = 30

  buttonRed = buttonRed/255
  buttonGreen = buttonGreen/255
  buttonBlue = buttonBlue/255

  self.clearButtons()
  self.createButton ({
    ['click_function'] = 'reshuffleDiscard',
    ['label'] = 'Reshuffle Discard',
    ['function_owner'] = self,
    ['position'] = {5.58, 0.9, -3.0},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 1200,
    ['height'] = 250,
    ['font_size'] = 100,
    ['color'] = {buttonRed, buttonGreen, buttonBlue},
    ['font_color'] = "White"
  })
  self.createButton ({
    ['click_function'] = 'discardReveals',
    ['label'] = 'Discard Revealed Cards',
    ['function_owner'] = self,
    ['position'] = {5.58, 0.9, -2.25},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 1200,
    ['height'] = 250,
    ['font_size'] = 100,
    ['color'] = {0,0,0},
    ['font_color'] = "White"
  })
  self.createButton ({
    ['click_function'] = 'drawHandStart',
    ['label'] = 'Draw 5 Cards',
    ['function_owner'] = self,
    ['position'] = {-5.58, 0.9, -3.0},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 1200,
    ['height'] = 250,
    ['font_size'] = 100,
    ['color'] = {buttonRed, buttonGreen, buttonBlue},
    ['font_color'] = "White"
  })
  self.createButton ({
    ['click_function'] = 'drawCard',
    ['label'] = 'Draw 1 Card',
    ['function_owner'] = self,
    ['position'] = {-5.58, 0.9, -2.25},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 1200,
    ['height'] = 250,
    ['font_size'] = 100,
    ['color'] = {buttonRed, buttonGreen, buttonBlue},
    ['font_color'] = "White"
  })

  buttonRed = 200
  buttonGreen = 90
  buttonBlue = 30

  buttonRed = buttonRed/255
  buttonGreen = buttonGreen/255
  buttonBlue = buttonBlue/255

  self.createButton ({
    ['click_function'] = 'spendFiveSpice',
    ['label'] = 'Spend 5 Spice',
    ['function_owner'] = self,
    ['position'] = {3.25, 0.9, 7.75},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 1200,
    ['height'] = 250,
    ['font_size'] = 100,
    ['color'] = {buttonRed, buttonGreen, buttonBlue},
    ['font_color'] = "White"
  })
  self.createButton ({
    ['click_function'] = 'spendOneSpice',
    ['label'] = 'Spend 1 Spice',
    ['function_owner'] = self,
    ['position'] = {3.25, 0.9, 7},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 1200,
    ['height'] = 250,
    ['font_size'] = 100,
    ['color'] = {buttonRed, buttonGreen, buttonBlue},
    ['font_color'] = "White"
  })

  buttonRed = 0
  buttonGreen = 153
  buttonBlue = 255

  buttonRed = buttonRed/255
  buttonGreen = buttonGreen/255
  buttonBlue = buttonBlue/255

  self.createButton ({
    ['click_function'] = 'spendWater',
    ['label'] = 'Spend 1 Water',
    ['function_owner'] = self,
    ['position'] = {-0.15, 0.9, 7},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 1200,
    ['height'] = 250,
    ['font_size'] = 100,
    ['color'] = {buttonRed, buttonGreen, buttonBlue},
    ['font_color'] = "White"
  })

  if getObjectFromGUID(firstPlayerToken).getVar("riseIX") == 1 then
    buttonRed = 25
    buttonGreen = 62
    buttonBlue = 52

    buttonRed = buttonRed/255
    buttonGreen = buttonGreen/255
    buttonBlue = buttonBlue/255

    self.createButton ({
      ['click_function'] = 'sendNegotiator',
      ['label'] = 'Send 1 Negotiator',
      ['function_owner'] = self,
      ['position'] = {-0.15, 0.9, 7.75},
      ['rotation'] =  {0, 0, 0},
      ['width'] = 1200,
      ['height'] = 250,
      ['font_size'] = 100,
      ['color'] = {buttonRed, buttonGreen, buttonBlue},
      ['font_color'] = "White"
    })
  end

  buttonRed = 128
  buttonGreen = 128
  buttonBlue = 128

  buttonRed = buttonRed/255
  buttonGreen = buttonGreen/255
  buttonBlue = buttonBlue/255

  self.createButton ({
    ['click_function'] = 'spendOneSolaris',
    ['label'] = 'Spend 1 Solaris',
    ['function_owner'] = self,
    ['position'] = {-3.5, 0.9, 7},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 1200,
    ['height'] = 250,
    ['font_size'] = 100,
    ['color'] = {buttonRed, buttonGreen, buttonBlue},
    ['font_color'] = "White"
  })
  self.createButton ({
    ['click_function'] = 'spendFiveSolaris',
    ['label'] = 'Spend 5 Solaris',
    ['function_owner'] = self,
    ['position'] = {-3.5, 0.9, 7.75},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 1200,
    ['height'] = 250,
    ['font_size'] = 100,
    ['color'] = {buttonRed, buttonGreen, buttonBlue},
    ['font_color'] = "White"
  })

  buttonRed = 200
  buttonGreen = 90
  buttonBlue = 30

  buttonRed = buttonRed/255
  buttonGreen = buttonGreen/255
  buttonBlue = buttonBlue/255

  self.createButton ({
    ['click_function'] = 'addGarrison',
    ['label'] = 'Add 1 to Garrison',
    ['function_owner'] = self,
    ['position'] = {6.80, 0.9, 7},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 1200,
    ['height'] = 250,
    ['font_size'] = 100,
    ['color'] = {buttonRed, buttonGreen, buttonBlue},
    ['font_color'] = "White"
  })
  self.createButton ({
    ['click_function'] = 'addConflict',
    ['label'] = 'Add 1 to Conflict Area',
    ['function_owner'] = self,
    ['position'] = {6.80, 0.9, 7.75},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 1200,
    ['height'] = 250,
    ['font_size'] = 100,
    ['color'] = {buttonRed, buttonGreen, buttonBlue},
    ['font_color'] = "White"
  })
end

function reshuffleDiscard()
  discardArea = GetDeckOrCard(discardZone)

  if discardArea != nil then

  discardArea.flip()
  discardArea.shuffle()
  discardArea.setPositionSmooth(drawSpot, false, true)

  Wait.frames(function()
   drawDeck = GetDeckOrCard(drawDeckZone)
   drawDeck.shuffle()
   drawDeck.shuffle()
  end, 60)

  end
end

function drawHandStart()
  startLuaCoroutine(self, "drawHand")
end

function drawHand()
  ::DrawStart::
  local starterDeck = GetDeckOrCard(starterDeckZone)
  local countCheck = 0
  local tagCheck = ""
  local drawCount = 0

  if starterDeck != nil then
   for i=1, 5 do
     if starterDeck != nil then
       countCheck = starterDeck.getQuantity()
       tagCheck = starterDeck.tag
     end

    if countCheck > 0 and tagCheck == "Deck" then
      if starterDeck != nil then
        starterDeck.deal(1, boardColor)
        drawCount = drawCount + 1
        starterDeck = GetDeckOrCard(starterDeckZone)
      end
    else
      if starterDeck != nil then
        starterDeck.deal(1, boardColor)
        drawCount = drawCount + 1
        if drawCount < 5 then
          reshuffleDiscard()
        end

        local Time = os.clock() + 2.0
          while os.clock() < Time do
            coroutine.yield(0)
          end

        starterDeck = GetDeckOrCard(starterDeckZone)
      end
    end
  end
 else
   reshuffleDiscard()

   local Time = os.clock() + 2.0
     while os.clock() < Time do
       coroutine.yield(0)
     end
   goto DrawStart
 end

  return 1
end

function drawCard()
  startLuaCoroutine(self, "drawCardRevised")
end

function drawCardRevised()
  ::DrawStart::
  local starterDeck = GetDeckOrCard(starterDeckZone)

  if starterDeck != nil then
    if starterDeck.getQuantity() > 0 then
      if starterDeck != nil then
        starterDeck.deal(1, boardColor)
        starterDeck = GetDeckOrCard(starterDeckZone)
      end
    else
      if starterDeck != nil then
        starterDeck.deal(1, boardColor)
        --reshuffleDiscard()
      end
    end
  else
    reshuffleDiscard()

    local Time = os.clock() + 2.0
      while os.clock() < Time do
        coroutine.yield(0)
        end
      goto DrawStart
  end

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

function spendOneSpice()
  local items = getObjectFromGUID(playerBoard).getObjects()
  local check = 0

  for _, item in ipairs(items) do
    if item.getName() == "1 Spice" then
      getObjectFromGUID("b70325").putObject(item)
      check = 1
      break
    end
  end

  if check == 0 then
   for _, item in ipairs(items) do
    if item.getName() == "5 Spice" then
      getObjectFromGUID("b70325").putObject(item)

      params = {"", "Orange"}
      getObjectFromGUID("85289a").call("makeSpiceStart", params)

      check = 1
      break
    end
   end
  end

  if check == 0 then
    if Player["Orange"].seated then
    printToColor("No 1 Spice Available!", boardColor)
    end
  end
end

function spendFiveSpice()
  local items = getObjectFromGUID(playerBoard).getObjects()
  local check = 0

  for _, item in ipairs(items) do
    if item.getName() == "5 Spice" then
      getObjectFromGUID("b70325").putObject(item)
      check = 1
      break
    end
  end

  local fiveCount = 0

  for _, item in ipairs(items) do
    if item.getName() == "1 Spice" then
      fiveCount = fiveCount + 1
    end
  end

  if fiveCount > 4 and check == 0 then
    check = 1
    local countDown= 5
    for _, item in ipairs(items) do
      if item.getName() == "1 Spice" then
        getObjectFromGUID(spiceOneBag).putObject(item)
        countDown = countDown - 1
        if countDown == 0 then
          break
        end
      end
    end
  end

  if check == 0 then
    if Player["Orange"].seated then
    printToColor("No 5 Spice Available!", boardColor)
    end
  end
end

function spendWater()
  local items = getObjectFromGUID(playerBoard).getObjects()
  local check = 0

  for _, item in ipairs(items) do
    if item.getName() == "Water" and item.tag == "Tile" then
      getObjectFromGUID(waterBag).putObject(item)
      check = 1
      break
    end
  end

  if check == 0 then
    if Player["Orange"].seated then
    printToColor("No Water Available!", boardColor)
    end
  end

end

function spendOneSolaris()
  local items = getObjectFromGUID(playerBoard).getObjects()
  local check = 0

  for _, item in ipairs(items) do
    if item.getName() == "1 Solaris" then
      getObjectFromGUID(solarisOneBag).putObject(item)
      check = 1
      break
    end
  end

  if check == 0 then
   for _, item in ipairs(items) do
    if item.getName() == "5 Solaris" then
      getObjectFromGUID(solarisFiveBag).putObject(item)

      params = {"", "Orange"}
      getObjectFromGUID(solarisOneBag).call("makeSolarisStart", params)

      check = 1
      break
    end
   end
  end

  if check == 0 then
    if Player["Orange"].seated then
    printToColor("No 1 Solaris Available!", boardColor)
    end
  end
end

function spendFiveSolaris()
  local items = getObjectFromGUID(playerBoard).getObjects()
  local check = 0

  for _, item in ipairs(items) do
    if item.getName() == "5 Solaris" then
      getObjectFromGUID(solarisFiveBag).putObject(item)
      check = 1
      break
    end
  end

  local fiveCount = 0

  for _, item in ipairs(items) do
    if item.getName() == "1 Solaris" then
      fiveCount = fiveCount + 1
    end
  end

  if fiveCount > 4 and check == 0 then
    check = 1
    local countDown= 5
    for _, item in ipairs(items) do
      if item.getName() == "1 Solaris" then
        getObjectFromGUID(solarisOneBag).putObject(item)
        countDown = countDown - 1
        if countDown == 0 then
          break
        end
      end
    end
  end

  if check == 0 then
    printToColor("No 5 Solaris Available!", boardColor)
  end
end

function addGarrison()
  math.randomseed(os.time())
  local items = getObjectFromGUID(supplyZone).getObjects()
  for _, item in ipairs(items) do
    if item.getName() == "Orange" and item.tag == "Block" then
      item.setPositionSmooth({(math.random(8,9) + 1.1),2, (-math.random(3,4) - 0.5)},false,true)
      item.setRotationSmooth({0,0,0})
      break
    end
  end
end

function addDreadnought()
  math.randomseed(os.time())
  local items = getObjectFromGUID(playerBoard).getObjects()
  for _, item in ipairs(items) do
    if item.getName() == "Orange Dreadnought" then
      item.setPositionSmooth({(math.random(8,9) + 1.1),2, (-math.random(3,4) - 0.5)},false,true)
      item.setRotationSmooth({0,180,0})
      break
    end
  end
end

function addDreadConflict()
  local dreadCheck = 0
  math.randomseed(os.time())
  local items = getObjectFromGUID(garrisonZone).getObjects()
  for _, item in ipairs(items) do
    if item.getName() == "Orange Dreadnought" then
      item.setPositionSmooth({(math.random(6,7) + 0.8),2, (-math.random(4,5) - 0.1)},false,true)
      item.setRotationSmooth({0,180,0})
      dreadCheck = 1
      break
    end
  end
  if dreadCheck == 0 then
    return 0
  else
    return 1
  end
end

function addConflict()
  math.randomseed(os.time())
  local items = getObjectFromGUID(garrisonZone).getObjects()
  for _, item in ipairs(items) do
    if item.getName() == "Orange" and item.tag == "Block" then
      item.setPositionSmooth({(math.random(6,7) + 0.8),2, (-math.random(4,5) - 0.1)},false,true)
      item.setRotationSmooth({0,0,0})
      break
    end
  end
end

function sendNegotiator()
  math.randomseed(os.time())
  local items = getObjectFromGUID(supplyZone).getObjects()
  for _, item in ipairs(items) do
    if item.getName() == "Orange" and item.tag == "Block" then
      item.setPositionSmooth({(math.random(16,17) + 0.45), 2, (math.random(7,9) + 0.25)},false,true)
      item.setRotationSmooth({0,0,0})
      broadcastToAll("Orange Player sent a Negotiator to IX", stringColorToRGB("Orange"))
      break
    end
  end
end

function sendSpecimen()
  math.randomseed(os.time())
  local adjustValueX = ((math.random(1,6)) / 10)
  local adjustValueZ = ((math.random(1,6)) / 10)
  local items = getObjectFromGUID(supplyZone).getObjects()
  for _, item in ipairs(items) do
    if item.getName() == "Orange" and item.tag == "Block" then
      item.setPositionSmooth({(math.random(2,4) + adjustValueX), 13, (math.random(21,22) + adjustValueZ)},false,true)
      item.setRotationSmooth({0,0,0})
      broadcastToAll("Orange Player sent a Specimen to the Axolotl Tanks", stringColorToRGB("Orange"))
      break
    end
  end
end

function rivalSetup()
  buttons = {}
  buttonIndex = ""

  buttons = self.getButtons()
  if buttons != nil then
    for i, v in pairs(buttons) do
      if v.label == "Draw 5 Cards" then
        buttonIndex = i-1
      end
    end
  end
  self.removeButton(buttonIndex)

  buttons = self.getButtons()
  if buttons != nil then
    for i, v in pairs(buttons) do
      if v.label == "Draw 1 Card" then
        buttonIndex = i-1
      end
    end
  end
  self.removeButton(buttonIndex)

  buttons = self.getButtons()
  if buttons != nil then
    for i, v in pairs(buttons) do
      if v.label == "Reshuffle Discard" then
        buttonIndex = i-1
      end
    end
  end
  self.removeButton(buttonIndex)

  buttons = self.getButtons()
  if buttons != nil then
    for i, v in pairs(buttons) do
      if v.label == "Discard Revealed Cards" then
        buttonIndexFour = i-1
      end
    end
  end
  self.removeButton(buttonIndexFour)
end

function rivalButtons()
  buttonRed = 200
  buttonGreen = 90
  buttonBlue = 30

  buttonRed = buttonRed/255
  buttonGreen = buttonGreen/255
  buttonBlue = buttonBlue/255

  self.createButton ({
    ['click_function'] = 'takeOneSpice',
    ['label'] = 'Take 1 Spice',
    ['function_owner'] = self,
    ['position'] = {3.25, 0.9, 6},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 1200,
    ['height'] = 250,
    ['font_size'] = 100,
    ['color'] = {buttonRed, buttonGreen, buttonBlue},
    ['font_color'] = "White"
  })

  buttonRed = 0
  buttonGreen = 153
  buttonBlue = 255

  buttonRed = buttonRed/255
  buttonGreen = buttonGreen/255
  buttonBlue = buttonBlue/255

  self.createButton ({
    ['click_function'] = 'takeWater',
    ['label'] = 'Take 1 Water',
    ['function_owner'] = self,
    ['position'] = {-0.15, 0.9, 6},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 1200,
    ['height'] = 250,
    ['font_size'] = 100,
    ['color'] = {buttonRed, buttonGreen, buttonBlue},
    ['font_color'] = "White"
  })

  buttonRed = 128
  buttonGreen = 128
  buttonBlue = 128

  buttonRed = buttonRed/255
  buttonGreen = buttonGreen/255
  buttonBlue = buttonBlue/255

  self.createButton ({
    ['click_function'] = 'takeOneSolaris',
    ['label'] = 'Take 1 Solaris',
    ['function_owner'] = self,
    ['position'] = {-3.5, 0.9, 6},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 1200,
    ['height'] = 250,
    ['font_size'] = 100,
    ['color'] = {buttonRed, buttonGreen, buttonBlue},
    ['font_color'] = "White"
  })

  self.createButton ({
    ['click_function'] = 'drawIntrigue',
    ['label'] = 'Draw 1 Intrigue Card',
    ['function_owner'] = self,
    ['position'] = {-5.58, 0.9, -3.0},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 1200,
    ['height'] = 250,
    ['font_size'] = 100,
    ['color'] = {0,0,0},
    ['font_color'] = "Yellow"
  })
end


function takeOneSpice()
  getObjectFromGUID(spiceOneBag).takeObject({position = spiceBowl, rotation = {0,180,0}})
end


function takeWater()
  getObjectFromGUID(waterBag).takeObject({position = waterBowl, rotation = {0,180,0}})
end

function takeOneSolaris()
  getObjectFromGUID(solarisOneBag).takeObject({position = solarisBowl, rotation = {0,180,0}})
end

function drawIntrigue()
  local intrigueDeck = GetDeckOrCard(intrigueZone)
  local deckPos = getObjectFromGUID(drawDeckZone).getPosition()
  deckPos.y = 2
  if intrigueDeck.name == "Deck" or intrigueDeck.name == "DeckCustom" then
    local cardPull = intrigueDeck.takeObject({position = deckPos, flip = false})
  elseif intrigueDeck.name == "Card" or intrigueDeck.name == "CardCustom" then
    cardPull = intrigueDeck
    local cardPull = intrigueDeck.takeObject({position = deckPos, flip = false})
  end
end

function discardIntrigue()
  playerHand = Player["Orange"].getHandObjects()
  for _, obj in ipairs(playerHand) do
    local scale = obj.getScale()
    if round(scale.x,2) == 0.88 and round(scale.z,2) == 0.88 then
      if obj.getDescription() == "Intrigue" then
        obj.setPosition({-18.00, 2.00, 17.81})
        obj.setRotation({0.00, 180.00, 180.00})
        break
      end
    end
  end
end

function discardIntrigueRival()
  local intriguePile = GetDeckOrCard("4a4d87")
  if intriguePile != nil then
    if intriguePile.name == "Card" or intriguePile.name == "CardCustom" then
      intriguePile.setPositionSmooth({-18.00, 2.00, 17.81}, false, true)
      intriguePile.setRotation({0.00, 180.00, 180.00})
    elseif intriguePile.name == "Deck" or intriguePile.name == "DeckCustom" then
      local objPull = intriguePile.takeObject()
      objPull.setPositionSmooth({-18.00, 2.00, 17.81}, false, true)
      objPull.setRotation({0.00, 180.00, 180.00})
    end
  end
end

function onObjectEnterScriptingZone(zone,obj)
  if zone.getGUID() == drawDeckZone and Global.getVar("rivals")[3] == 1 then
   if obj.name == "Card" or obj.name == "CardCustom" then
    local vpCheck = 0
    local scaleCheck = obj.getScale()
    if round(scaleCheck.x,2) == 0.88 then
     Wait.frames(function()
      local deckCheck = GetDeckOrCard(drawDeckZone)
      if deckCheck != nil then
        if vpCheck == 0 and deckCheck.name == "Deck" or deckCheck.name == "DeckCustom" then
          if deckCheck.getQuantity() == 3 then
            vpCheck = 1
            deckCheck.setPositionSmooth({-18.00, 3.00, 17.81}, false, true)
            getObjectFromGUID("2da390").call("upOrange",{})
          end
        end
      end
     end,60)
    end
   end
  end
end

function discardReveals()
  local discardRevealPos = getObjectFromGUID(discardZone).getPosition()
  local revealCards = getObjectFromGUID(revealButton).getVar("revealedCards")
  local revealAreaItems = getObjectFromGUID(revealArea).getObjects()

  discardRevealPos.y = 2

  for _, cardR in ipairs(revealCards) do
    if getObjectFromGUID(cardR) then
      getObjectFromGUID(cardR).setPositionSmooth(discardRevealPos,false,true)
    end
  end

  getObjectFromGUID(revealButton).call("resetReveal",{})

  for _, itemR in ipairs (revealAreaItems) do
    if itemR.tag == "Card" or itemR.tag == "CardCustom" or itemR.tag == "Deck" or itemR.tag == "DeckCustom" then
      itemR.setPositionSmooth(discardRevealPos,false,true)
    end
  end
end

function round(num, dec)
  local mult = 10^(dec or 0)
  return math.floor(num * mult + 0.5) / mult
end

-- ===== Troop Supply fe3513 (2427 chars) =====
--Counting Bowl    by MrStump
timerID = ""

validCountItemList = {
    ["Orange"] = 1,
}

function onLoad()
    timerID = self.getGUID()..math.random(9999999999999)
    
    self.createButton({
        label="", click_function="none", function_owner=self,
        position={0,1.4,-1.8}, rotation={0,180,0}, height=00, width=0,
        font_color={1,1,1}, font_size=250
    })
    
    Timer.create({
        identifier=timerID,
        function_name="countItems", function_owner=self,
        repetitions=0, delay=0.75
    })
end

--Activated once per second, counts items in bowls
function countItems()
    local totalValue = 0
    local itemsInBowl = findItemsInSphere()
    --Go through all items found by the cast
    for _, entry in ipairs(itemsInBowl) do
        --Ignore the bowl
        if entry.hit_object ~= self then
            local tableEntry = validCountItemList[entry.hit_object.getName()]
            --Ignore if not in validCountItemList
            if tableEntry ~= nil then
                local descValue = tonumber(entry.hit_object.getDescription())
                local stackMult = math.abs(entry.hit_object.getQuantity())
                --Use value in description if available
                if descValue ~= nil then
                    totalValue = totalValue + descValue * stackMult
                else
                    --Otherwise use the value in validCountItemList
                    totalValue = totalValue + tableEntry * stackMult
                end
            end
        end
    end
    --Updates the number display
    if totalValue == 1 then 
      totalValue = (totalValue .. " Troop")
    elseif totalValue > 1 then
      totalValue = (totalValue .. " Troops")
    elseif totalValue == 0 then
      totalValue = ("0 Troops")
    end
    self.editButton({index=0, label=totalValue})
end

--Gets the items in the bowl for countItems to count
function findItemsInSphere()
    --Find scaling factor
    local scale = self.getScale()
    --Set position for the sphere
    local pos = self.getPosition()
    pos.y=pos.y+(1.25*scale.y)
    --Ray trace to get all objects
    return Physics.cast({
        origin=pos, direction={0,1,0}, type=2, max_distance=0,
        size={3.4*scale.x,3.4*scale.y,3.4*scale.z}, --debug=true
    })
end

function onDestroy()
  --if timerID ~= nil then
    --Timer.destroy(timerID)
  --end
end

-- ===== Earl Thorvald d9daed (1913 chars) =====
function onLoad()
  if Vector.equals(self.getPosition(), Vector({24.00, 1.08, 22.80}), 0.02) then
  self.createButton({
     click_function = "claimLeader",
     function_owner = self,
     label          = "Claim Leader",
     position       = {0,0.2,0.4},
     rotation       = {0, 0, 0},
     scale          = {0.5, 1, 0.5},
     width          = 700,
     height         = 150,
     tooltip        = "",
     font_color     = {1, 1, 1},
     font_size      = 85,
     color          = "Black"
     })
  end
end 
	 
function claimLabel()
  self.createButton({
     click_function = "claimLeader",
     function_owner = self,
     label          = "Claim Leader",
     position       = {0,0.2,0.4},
     rotation       = {0, 0, 0},
     scale          = {0.5, 1, 0.5},
     width          = 700,
     height         = 150,
     tooltip        = "",
     font_color     = {1, 1, 1},
     font_size      = 85,
     color          = "Black"
     })
end

function claimLeader(GO, color)
  if color == "Red" then
    leaderPos = {-40.00, 2, -12.89}
    leaderRot = {0.00, 180.00, 0.00}
    GO.setPositionSmooth(leaderPos)
    GO.setRotationSmooth(leaderRot)
    GO.clearButtons()
  elseif color == "Blue" then
    leaderPos = {-15.00, 2, -12.89}
    leaderRot = {0.00, 180.00, 0.00}
    GO.setPositionSmooth(leaderPos)
    GO.setRotationSmooth(leaderRot)
    GO.clearButtons()
  elseif color == "Orange" then
    leaderPos = {15.00, 2, -12.89}
    leaderRot = {0.00, 180.00, 0.00}
    GO.setPositionSmooth(leaderPos)
    GO.setRotationSmooth(leaderRot)
    GO.clearButtons()
  elseif color == "Green" then
    leaderPos = {40.00, 2, -12.89}
    leaderRot = {0.00, 180.00, 0.00}
    GO.setPositionSmooth(leaderPos)
    GO.setRotationSmooth(leaderRot)
    GO.clearButtons()
  else
    printToAll("Cannot Select Leader Until the Player is Seated!")
  end
end

-- ===== Water 8b211a (3545 chars) =====
--Counting Bowl    by MrStump
timerID = ""

validCountItemList = {
    ["Water"] = 1,
}

soloGame = 0
vpCheck = 0

function onLoad(saved_game_data)
    if saved_game_data ~= "" and saved_game_data ~= nil then
      local loaded_data = JSON.decode(saved_game_data)
      soloGame = loaded_data[1]
      vpCheck = loaded_data[2]
    else
      soloGame = 0
      vpCheck = 0
    end

    timerID = self.getGUID()..math.random(9999999999999)

    self.createButton({
        label="", click_function="none", function_owner=self,
        position={0,1.4,-1.5}, rotation={0,180,0}, height=00, width=0,
        font_color={1,1,1}, font_size=250
    })

    Timer.create({
        identifier=timerID,
        function_name="countItems", function_owner=self,
        repetitions=0, delay=0.75
    })
end

function onSave()
  local sg = soloGame
  local vpc = vpCheck

  local data_to_save = {sg,vpc}

  saved_game_data = JSON.encode(data_to_save)

  return saved_game_data
end

--Activated once per second, counts items in bowls
function countItems()
    local totalValue = 0
    local itemsInBowl = findItemsInSphere()
    --Go through all items found by the cast
    for _, entry in ipairs(itemsInBowl) do
        --Ignore the bowl
        if entry.hit_object ~= self then
            local tableEntry = validCountItemList[entry.hit_object.getName()]
            --Ignore if not in validCountItemList
            if tableEntry ~= nil then
                local descValue = tonumber(entry.hit_object.getDescription())
                local stackMult = math.abs(entry.hit_object.getQuantity())
                --Use value in description if available
                if descValue ~= nil then
                    totalValue = totalValue + descValue * stackMult
                else
                    --Otherwise use the value in validCountItemList
                    totalValue = totalValue + tableEntry * stackMult
                end
            end
        end
    end
    --Updates the number display
    spendCheck = totalValue
    totalValue = (totalValue .. " Water")

    UI.setValue("WATERorange", totalValue)

    self.editButton({index=0, label=totalValue})
    if spendCheck >= 3 and vpCheck == 0 and soloGame == 1 then
      vpCheck = 1
      startLuaCoroutine(self, "spendResources")
      getObjectFromGUID("2da390").call("upOrange",{})
    end
end

--Gets the items in the bowl for countItems to count
function findItemsInSphere()
    --Find scaling factor
    local scale = self.getScale()
    --Set position for the sphere
    local pos = self.getPosition()
    pos.y=pos.y+(1.25*scale.y)
    --Ray trace to get all objects
    return Physics.cast({
        origin=pos, direction={0,1,0}, type=2, max_distance=0,
        size={3.4*scale.x,3.4*scale.y,3.4*scale.z}, --debug=true
    })
end

function onDestroy()
  --if timerID ~= nil then
    --Timer.destroy(timerID)
  --end
end

function spendResources()
  local playerBoard = "bd5bf6"
  local itemCount = 3

  if soloGame == 1 then
    local rivalItems = getObjectFromGUID(playerBoard).getObjects()

    for _, item in ipairs(rivalItems) do
      if item.getName() == "Water" and itemCount > 0 and item.getGUID() != self.getGUID() then

        local Time = os.clock() + 0.2
        while os.clock() < Time do
          coroutine.yield(0)
        end

        getObjectFromGUID("b70325").putObject(item)
        itemCount = itemCount - 1
      end
    end
  end
  vpCheck = 0
  return 1
end

function setSolo()
  soloGame = 1
end

-- ===== Solaris 04d59b (3879 chars) =====
--Counting Bowl    by MrStump
  timerID = ""

  validCountItemList = {
    ["5 Solaris"] = 5,
    ["1 Solaris"] = 1,
  }

  soloGame = 0
  vpCheck = 0

  function onLoad(saved_game_data)
      if saved_game_data ~= "" and saved_game_data ~= nil then
        local loaded_data = JSON.decode(saved_game_data)
        soloGame = loaded_data[1]
        vpCheck = loaded_data[2]
      else
        soloGame = 0
        vpCheck = 0
      end

      timerID = self.getGUID()..math.random(9999999999999)

      self.createButton({
          label="", click_function="none", function_owner=self,
          position={0,1.4,-1.5}, rotation={0,180,0}, height=00, width=0,
          font_color={1,1,1}, font_size=250
      })

      Timer.create({
          identifier=timerID,
          function_name="countItems", function_owner=self,
          repetitions=0, delay=0.75
      })
  end

  function onSave()
    local sg = soloGame
    local vpc = vpCheck

    local data_to_save = {sg,vpc}

    saved_game_data = JSON.encode(data_to_save)

    return saved_game_data
  end

--Activated once per second, counts items in bowls
function countItems()
    local totalValue = 0
    local itemsInBowl = findItemsInSphere()
    --Go through all items found by the cast
    for _, entry in ipairs(itemsInBowl) do
        --Ignore the bowl
        if entry.hit_object ~= self then
            local tableEntry = validCountItemList[entry.hit_object.getName()]
            --Ignore if not in validCountItemList
            if tableEntry ~= nil then
                local descValue = tonumber(entry.hit_object.getDescription())
                local stackMult = math.abs(entry.hit_object.getQuantity())
                --Use value in description if available
                if descValue ~= nil then
                    totalValue = totalValue + descValue * stackMult
                else
                    --Otherwise use the value in validCountItemList
                    totalValue = totalValue + tableEntry * stackMult
                end
            end
        end
    end
    --Updates the number display
    spendCheck = totalValue
    totalValue = (totalValue .. " Solaris")

    UI.setValue("SOLARISorange", totalValue)

    self.editButton({index=0, label=totalValue})
    if spendCheck >= 7 and vpCheck == 0 and soloGame == 1 then
      vpCheck = 1
      startLuaCoroutine(self, "spendResources")
      getObjectFromGUID("2da390").call("upOrange",{})
    end

end

--Gets the items in the bowl for countItems to count
function findItemsInSphere()
    --Find scaling factor
    local scale = self.getScale()
    --Set position for the sphere
    local pos = self.getPosition()
    pos.y=pos.y+(1.25*scale.y)
    --Ray trace to get all objects
    return Physics.cast({
        origin=pos, direction={0,1,0}, type=2, max_distance=0,
        size={3.4*scale.x,3.4*scale.y,3.4*scale.z}, --debug=true
    })
end

function onDestroy()
  --if timerID ~= nil then
    --Timer.destroy(timerID)
  --end
end

function spendResources()
  local playerBoard = "bd5bf6"
  local itemCount = 7

  if soloGame == 1 then
    local rivalItems = getObjectFromGUID(playerBoard).getObjects()

    for _, item in ipairs(rivalItems) do
      if item.getName() == "5 Solaris" and itemCount > 4 then

        local Time = os.clock() + 0.2
        while os.clock() < Time do
          coroutine.yield(0)
        end

        getObjectFromGUID("b70325").putObject(item)
        itemCount = itemCount - 5
      elseif item.getName() == "1 Solaris" and itemCount > 0 then

        local Time = os.clock() + 0.2
        while os.clock() < Time do
          coroutine.yield(0)
        end

        getObjectFromGUID("b70325").putObject(item)
        itemCount = itemCount - 1
      end
    end
  end
  vpCheck = 0
  return 1
end

function setSolo()
  soloGame = 1
end

-- ===== Spice 1d6251 (5621 chars) =====
--Counting Bowl    by MrStump
timerID = ""

validCountItemList = {
    ["5 Spice"] = 5,
    ["1 Spice"] = 1,
}

soloGame = 0
vpCheck = 0
spiceCount = 0
firstPlayerToken = "784534"

function onLoad(saved_game_data)
    if saved_game_data ~= "" and saved_game_data ~= nil then
      local loaded_data = JSON.decode(saved_game_data)
      soloGame = loaded_data[1]
      vpCheck = loaded_data[2]
    else
      soloGame = 0
      vpCheck = 0
    end

    timerID = self.getGUID()..math.random(9999999999999)

    self.createButton({
        label="", click_function="none", function_owner=self,
        position={0,1.4,-1.5}, rotation={0,180,0}, height=00, width=0,
        font_color={1,1,1}, font_size=250
    })

    Timer.create({
        identifier=timerID,
        function_name="countItems", function_owner=self,
        repetitions=0, delay=0.75
    })
end

function onSave()
  local sg = soloGame
  local vpc = vpCheck

  local data_to_save = {sg,vpc}

  saved_game_data = JSON.encode(data_to_save)

  return saved_game_data
end

--Activated once per second, counts items in bowls
function countItems()
    local totalValue = 0
    local itemsInBowl = findItemsInSphere()
    --Go through all items found by the cast
    for _, entry in ipairs(itemsInBowl) do
        --Ignore the bowl
        if entry.hit_object ~= self then
            local tableEntry = validCountItemList[entry.hit_object.getName()]
            --Ignore if not in validCountItemList
            if tableEntry ~= nil then
                local descValue = tonumber(entry.hit_object.getDescription())
                local stackMult = math.abs(entry.hit_object.getQuantity())
                --Use value in description if available
                if descValue ~= nil then
                    totalValue = totalValue + descValue * stackMult
                else
                    --Otherwise use the value in validCountItemList
                    totalValue = totalValue + tableEntry * stackMult
                end
            end
        end
    end
    --Updates the number display
    spendCheck = totalValue
    spiceCount = totalValue
    totalValue = (totalValue .. " Spice")

    UI.setValue("SPICEorange", totalValue)

    local intrigueCheck = GetDeckOrCard("4a4d87")
    if intrigueCheck != nil and Global.getVar("inProgress") == 1 and Global.getVar("rivals")[3] == 1 then
      local intrigueCount = intrigueCheck.getQuantity()
      if intrigueCount == -1 then
        intrigueCount = 1
      end
      UI.setValue("INTRIGUEorange", intrigueCount)
    elseif intrigueCheck == nil and Global.getVar("inProgress") == 1 and Global.getVar("rivals")[3] == 1 then
      intrigueCount = 0
      UI.setValue("INTRIGUEorange", intrigueCount)
    elseif Global.getVar("inProgress") == 1 and Global.getVar("rivals")[3] != 1 then
      local handQuery = Player["Orange"].getHandObjects(1)
      local intrigueCount = 0

      for _, cardItem in ipairs(handQuery) do
        if cardItem.getDescription() == "Intrigue" then
          intrigueCount = intrigueCount + 1
        end
      end
      UI.setValue("INTRIGUEorange", intrigueCount)
    end

    self.editButton({index=0, label=totalValue})
    if spendCheck >= 7 and vpCheck == 0 and soloGame == 1 then
      startLuaCoroutine(self, "spendResources")
      --getObjectFromGUID("2da390").call("upOrange",{})
    end
end

--Gets the items in the bowl for countItems to count
function findItemsInSphere()
    --Find scaling factor
    local scale = self.getScale()
    --Set position for the sphere
    local pos = self.getPosition()
    pos.y=pos.y+(1.25*scale.y)
    --Ray trace to get all objects
    return Physics.cast({
        origin=pos, direction={0,1,0}, type=2, max_distance=0,
        size={3.4*scale.x,3.4*scale.y,3.4*scale.z}, --debug=true
    })
end

function onDestroy()
  --if timerID ~= nil then
    --Timer.destroy(timerID)
  --end
end

function spendResources()
  local playerBoard = "bd5bf6"
  local itemCount = 7
  local conflictCount = 0
  local ixCheck = 0

  for _, conflictObj in ipairs(getObjectFromGUID("4a21d4").getObjects()) do
    if conflictObj.tag == "Deck" or conflictObj.tag == "DeckCustom" then
      conflictCount = conflictObj.getQuantity()
    end
  end

  if conflictCount >= (7 - getObjectFromGUID(firstPlayerToken).getVar("epicMode")) and getObjectFromGUID(firstPlayerToken).getVar("riseIX") == 1 then
    ixCheck = 1
  end

  if soloGame == 1 and ixCheck == 1 then
    for i=1, itemCount do
      getObjectFromGUID("e435ab").call("spendOneSpice", {})
      itemCount = itemCount - 1

      local Time = os.clock() + 0.5
      while os.clock() < Time do
        coroutine.yield(0)
      end
    end
    getObjectFromGUID("2da390").call("upOrange",{})

  elseif soloGame == 1 and getObjectFromGUID(firstPlayerToken).getVar("riseIX") == 0 then
    for i=1, itemCount do
      getObjectFromGUID("e435ab").call("spendOneSpice", {})
      itemCount = itemCount - 1

      local Time = os.clock() + 0.5
      while os.clock() < Time do
        coroutine.yield(0)
      end
    end
    getObjectFromGUID("2da390").call("upOrange",{})

  end
  vpCheck = 0
  return 1
end

function setSolo()
  soloGame = 1
end

function GetDeckOrCard(zoneGUID)
  for _, obj in ipairs(getObjectFromGUID(zoneGUID).getObjects()) do
    if obj.name == "Card" or obj.name == "CardCustom" or obj.name == "Deck" or obj.name == "DeckCustom" then
      return obj
    end
  end

 return nil
end

-- ===== Spice 9a6fc5 (5623 chars) =====
--Counting Bowl    by MrStump
timerID = ""

validCountItemList = {
    ["5 Spice"] = 5,
    ["1 Spice"] = 1,
}

soloGame = 0
vpCheck = 0
spiceCount = 0
firstPlayerToken = "784534"

function onLoad(saved_game_data)
    if saved_game_data ~= "" and saved_game_data ~= nil then
      local loaded_data = JSON.decode(saved_game_data)
      soloGame = loaded_data[1]
      vpCheck = loaded_data[2]
    else
      soloGame = 0
      vpCheck = 0
    end

    timerID = self.getGUID()..math.random(9999999999999)

    self.createButton({
        label="", click_function="none", function_owner=self,
        position={0,1.4,-1.5}, rotation={0,180,0}, height=00, width=0,
        font_color={1,1,1}, font_size=250
    })

    Timer.create({
        identifier=timerID,
        function_name="countItems", function_owner=self,
        repetitions=0, delay=0.75
    })
end

function onSave()
  local sg = soloGame
  local vpc = vpCheck

  local data_to_save = {sg,vpc}

  saved_game_data = JSON.encode(data_to_save)

  return saved_game_data
end

--Activated once per second, counts items in bowls
function countItems()
    local totalValue = 0
    local itemsInBowl = findItemsInSphere()
    --Go through all items found by the cast
    for _, entry in ipairs(itemsInBowl) do
        --Ignore the bowl
        if entry.hit_object ~= self then
            local tableEntry = validCountItemList[entry.hit_object.getName()]
            --Ignore if not in validCountItemList
            if tableEntry ~= nil then
                local descValue = tonumber(entry.hit_object.getDescription())
                local stackMult = math.abs(entry.hit_object.getQuantity())
                --Use value in description if available
                if descValue ~= nil then
                    totalValue = totalValue + descValue * stackMult
                else
                    --Otherwise use the value in validCountItemList
                    totalValue = totalValue + tableEntry * stackMult
                end
            end
        end
    end
    --Updates the number display
    spendCheck = totalValue
    spiceCount = totalValue
    totalValue = (totalValue .. " Spice")

    UI.setValue("SPICEblue", totalValue)

    local intrigueCheck = GetDeckOrCard("6a6014")
    if intrigueCheck != nil and Global.getVar("inProgress") == 1 and Global.getVar("rivals")[2] == 1 then
      local intrigueCount = intrigueCheck.getQuantity()
      if intrigueCount == -1 then
        intrigueCount = 1
      end
      UI.setValue("INTRIGUEblue", intrigueCount)
    elseif intrigueCheck == nil and Global.getVar("inProgress") == 1 and Global.getVar("rivals")[2] == 1 then
      intrigueCount = 0
      UI.setValue("INTRIGUEblue", intrigueCount)
    elseif Global.getVar("inProgress") == 1 and Global.getVar("rivals")[2] != 1 then
      local handQuery = Player["Blue"].getHandObjects(1)
      local intrigueCount = 0

      for _, cardItem in ipairs(handQuery) do
        if cardItem.getDescription() == "Intrigue" then
          intrigueCount = intrigueCount + 1
        end
      end
      UI.setValue("INTRIGUEblue", intrigueCount)
    end

    self.editButton({index=0, label=totalValue})
    if spendCheck >= 7 and vpCheck == 0 and soloGame == 1 then
      vpCheck = 1
      startLuaCoroutine(self, "spendResources")
      --getObjectFromGUID("2da390").call("upRed",{})
    end
end

--Gets the items in the bowl for countItems to count
function findItemsInSphere()
    --Find scaling factor
    local scale = self.getScale()
    --Set position for the sphere
    local pos = self.getPosition()
    pos.y=pos.y+(1.25*scale.y)
    --Ray trace to get all objects
    return Physics.cast({
        origin=pos, direction={0,1,0}, type=2, max_distance=0,
        size={3.4*scale.x,3.4*scale.y,3.4*scale.z}, --debug=true
    })
end

function onDestroy()
  --if timerID ~= nil then
    --Timer.destroy(timerID)
  --end
end

function spendResources()
  local playerBoard = "9b4f33"
  local itemCount = 7
  local conflictCount = 0
  local ixCheck = 0

  for _, conflictObj in ipairs(getObjectFromGUID("4a21d4").getObjects()) do
    if conflictObj.tag == "Deck" or conflictObj.tag == "DeckCustom" then
      conflictCount = conflictObj.getQuantity()
    end
  end

  if conflictCount >= (7 - getObjectFromGUID(firstPlayerToken).getVar("epicMode")) and getObjectFromGUID(firstPlayerToken).getVar("riseIX") == 1 then
    ixCheck = 1
  end

  if soloGame == 1 and ixCheck == 1 then
    for i=1, itemCount do
      getObjectFromGUID("042887").call("spendOneSpice", {})
      itemCount = itemCount - 1

      local Time = os.clock() + 0.5
      while os.clock() < Time do
        coroutine.yield(0)
      end
    end
    getObjectFromGUID("2da390").call("upBlue",{})

  elseif soloGame == 1 and getObjectFromGUID(firstPlayerToken).getVar("riseIX") == 0 then
    for i=1, itemCount do
      getObjectFromGUID("042887").call("spendOneSpice", {})
      itemCount = itemCount - 1

      local Time = os.clock() + 0.5
      while os.clock() < Time do
        coroutine.yield(0)
      end
    end
    getObjectFromGUID("2da390").call("upBlue",{})

  end
  vpCheck = 0
  return 1
end

function setSolo()
  soloGame = 1
end

function GetDeckOrCard(zoneGUID)
  for _, obj in ipairs(getObjectFromGUID(zoneGUID).getObjects()) do
    if obj.name == "Card" or obj.name == "CardCustom" or obj.name == "Deck" or obj.name == "DeckCustom" then
      return obj
    end
  end

 return nil
end

-- ===== Water 985873 (3541 chars) =====
--Counting Bowl    by MrStump
timerID = ""

validCountItemList = {
    ["Water"] = 1,
}

soloGame = 0
vpCheck = 0

function onLoad(saved_game_data)
    if saved_game_data ~= "" and saved_game_data ~= nil then
      local loaded_data = JSON.decode(saved_game_data)
      soloGame = loaded_data[1]
      vpCheck = loaded_data[2]
    else
      soloGame = 0
      vpCheck = 0
    end

    timerID = self.getGUID()..math.random(9999999999999)

    self.createButton({
        label="", click_function="none", function_owner=self,
        position={0,1.4,-1.5}, rotation={0,180,0}, height=00, width=0,
        font_color={1,1,1}, font_size=250
    })

    Timer.create({
        identifier=timerID,
        function_name="countItems", function_owner=self,
        repetitions=0, delay=0.75
    })
end

function onSave()
  local sg = soloGame
  local vpc = vpCheck

  local data_to_save = {sg,vpc}

  saved_game_data = JSON.encode(data_to_save)

  return saved_game_data
end

--Activated once per second, counts items in bowls
function countItems()
    local totalValue = 0
    local itemsInBowl = findItemsInSphere()
    --Go through all items found by the cast
    for _, entry in ipairs(itemsInBowl) do
        --Ignore the bowl
        if entry.hit_object ~= self then
            local tableEntry = validCountItemList[entry.hit_object.getName()]
            --Ignore if not in validCountItemList
            if tableEntry ~= nil then
                local descValue = tonumber(entry.hit_object.getDescription())
                local stackMult = math.abs(entry.hit_object.getQuantity())
                --Use value in description if available
                if descValue ~= nil then
                    totalValue = totalValue + descValue * stackMult
                else
                    --Otherwise use the value in validCountItemList
                    totalValue = totalValue + tableEntry * stackMult
                end
            end
        end
    end
    --Updates the number display
    spendCheck = totalValue
    totalValue = (totalValue .. " Water")

    UI.setValue("WATERblue", totalValue)

    self.editButton({index=0, label=totalValue})
    if spendCheck >= 3 and vpCheck == 0 and soloGame == 1 then
      vpCheck = 1
      startLuaCoroutine(self, "spendResources")
      getObjectFromGUID("2da390").call("upBlue",{})
    end
end

--Gets the items in the bowl for countItems to count
function findItemsInSphere()
    --Find scaling factor
    local scale = self.getScale()
    --Set position for the sphere
    local pos = self.getPosition()
    pos.y=pos.y+(1.25*scale.y)
    --Ray trace to get all objects
    return Physics.cast({
        origin=pos, direction={0,1,0}, type=2, max_distance=0,
        size={3.4*scale.x,3.4*scale.y,3.4*scale.z}, --debug=true
    })
end

function onDestroy()
  --if timerID ~= nil then
    --Timer.destroy(timerID)
  --end
end

function spendResources()
  local playerBoard = "9b4f33"
  local itemCount = 3

  if soloGame == 1 then
    local rivalItems = getObjectFromGUID(playerBoard).getObjects()

    for _, item in ipairs(rivalItems) do
      if item.getName() == "Water" and itemCount > 0 and item.getGUID() != self.getGUID() then

        local Time = os.clock() + 0.2
        while os.clock() < Time do
          coroutine.yield(0)
        end

        getObjectFromGUID("9f81fa").putObject(item)
        itemCount = itemCount - 1
      end
    end
  end
  vpCheck = 0
  return 1
end

function setSolo()
  soloGame = 1
end

-- ===== Solaris 235331 (3791 chars) =====
--Counting Bowl    by MrStump
timerID = ""

validCountItemList = {
    ["5 Solaris"] = 5,
    ["1 Solaris"] = 1,
}

soloGame = 0
vpCheck = 0

function onLoad(saved_game_data)
    if saved_game_data ~= "" and saved_game_data ~= nil then
      local loaded_data = JSON.decode(saved_game_data)
      soloGame = loaded_data[1]
      vpCheck = loaded_data[2]
    else
      soloGame = 0
      vpCheck = 0
    end

    timerID = self.getGUID()..math.random(9999999999999)

    self.createButton({
        label="", click_function="none", function_owner=self,
        position={0,1.4,-1.5}, rotation={0,180,0}, height=00, width=0,
        font_color={1,1,1}, font_size=250
    })

    Timer.create({
        identifier=timerID,
        function_name="countItems", function_owner=self,
        repetitions=0, delay=0.75
    })
end

function onSave()
  local sg = soloGame
  local vpc = vpCheck

  local data_to_save = {sg,vpc}

  saved_game_data = JSON.encode(data_to_save)

  return saved_game_data
end

--Activated once per second, counts items in bowls
function countItems()
    local totalValue = 0
    local itemsInBowl = findItemsInSphere()
    --Go through all items found by the cast
    for _, entry in ipairs(itemsInBowl) do
        --Ignore the bowl
        if entry.hit_object ~= self then
            local tableEntry = validCountItemList[entry.hit_object.getName()]
            --Ignore if not in validCountItemList
            if tableEntry ~= nil then
                local descValue = tonumber(entry.hit_object.getDescription())
                local stackMult = math.abs(entry.hit_object.getQuantity())
                --Use value in description if available
                if descValue ~= nil then
                    totalValue = totalValue + descValue * stackMult
                else
                    --Otherwise use the value in validCountItemList
                    totalValue = totalValue + tableEntry * stackMult
                end
            end
        end
    end
    --Updates the number display
    spendCheck = totalValue
    totalValue = (totalValue .. " Solaris")
    self.editButton({index=0, label=totalValue})

    UI.setValue("SOLARISblue", totalValue)

    if spendCheck >= 7 and vpCheck == 0 and soloGame == 1 then
      startLuaCoroutine(self, "spendResources")
      getObjectFromGUID("2da390").call("upBlue",{})
    end
end

--Gets the items in the bowl for countItems to count
function findItemsInSphere()
    --Find scaling factor
    local scale = self.getScale()
    --Set position for the sphere
    local pos = self.getPosition()
    pos.y=pos.y+(1.25*scale.y)
    --Ray trace to get all objects
    return Physics.cast({
        origin=pos, direction={0,1,0}, type=2, max_distance=0,
        size={3.4*scale.x,3.4*scale.y,3.4*scale.z}, --debug=true
    })
end

function onDestroy()
  --if timerID ~= nil then
    --Timer.destroy(timerID)
  --end
end

function spendResources()
  local playerBoard = "9b4f33"
  local itemCount = 7

  if soloGame == 1 then
    local rivalItems = getObjectFromGUID(playerBoard).getObjects()

    for _, item in ipairs(rivalItems) do
      if item.getName() == "5 Solaris" and itemCount > 4 then

        local Time = os.clock() + 0.2
        while os.clock() < Time do
          coroutine.yield(0)
        end

        getObjectFromGUID("9f81fa").putObject(item)
        itemCount = itemCount - 5
      elseif item.getName() == "1 Solaris" and itemCount > 0 then

        local Time = os.clock() + 0.2
        while os.clock() < Time do
          coroutine.yield(0)
        end

        getObjectFromGUID("9f81fa").putObject(item)
        itemCount = itemCount - 1
      end
    end
  end
  vpCheck = 0
  return 1
end

function setSolo()
  soloGame = 1
end

-- ===== Custom_Board f8a49f (20955 chars) =====
discardZone = "9a3af6"
drawDeckZone = "2570f5"
supplyZone = "1cb2a6"
garrisonZone = "c88ae3"
drawSpot = {35.39, 3, -12.89}
starterDeckZone = "2570f5"
boardColor = "Green"
playerBoard = "231215"
intrigueZone = "e9f30d"
revealButton = "3f4f80"
revealArea = "786b8b"
firstPlayerToken = "784534"

solarisFiveBag = "3f6168"
solarisOneBag = "5090e6"
waterBag = "400db5"
spiceFiveBag = "3d38e5"
spiceOneBag = "85289a"

solarisBowl = {49.00, 3.5, -13.00}
waterBowl = {49.00, 3.5, -16.00}
spiceBowl = {49.00, 3.5, -19.00}

function boardSetup()
  buttonRed = 20
  buttonGreen = 100
  buttonBlue = 10

  buttonRed = buttonRed/255
  buttonGreen = buttonGreen/255
  buttonBlue = buttonBlue/255

  self.clearButtons()
  self.createButton ({
    ['click_function'] = 'reshuffleDiscard',
    ['label'] = 'Reshuffle Discard',
    ['function_owner'] = self,
    ['position'] = {5.58, 0.9, -3.0},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 1200,
    ['height'] = 250,
    ['font_size'] = 100,
    ['color'] = {buttonRed, buttonGreen, buttonBlue},
    ['font_color'] = "White"
  })
  self.createButton ({
    ['click_function'] = 'discardReveals',
    ['label'] = 'Discard Revealed Cards',
    ['function_owner'] = self,
    ['position'] = {5.58, 0.9, -2.25},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 1200,
    ['height'] = 250,
    ['font_size'] = 100,
    ['color'] = {0,0,0},
    ['font_color'] = "White"
  })
  self.createButton ({
    ['click_function'] = 'drawHandStart',
    ['label'] = 'Draw 5 Cards',
    ['function_owner'] = self,
    ['position'] = {-5.58, 0.9, -3.0},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 1200,
    ['height'] = 250,
    ['font_size'] = 100,
    ['color'] = {buttonRed, buttonGreen, buttonBlue},
    ['font_color'] = "White"
  })
  self.createButton ({
    ['click_function'] = 'drawCard',
    ['label'] = 'Draw 1 Card',
    ['function_owner'] = self,
    ['position'] = {-5.58, 0.9, -2.25},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 1200,
    ['height'] = 250,
    ['font_size'] = 100,
    ['color'] = {buttonRed, buttonGreen, buttonBlue},
    ['font_color'] = "White"
  })

  buttonRed = 255
  buttonGreen = 084
  buttonBlue = 0

  buttonRed = buttonRed/255
  buttonGreen = buttonGreen/255
  buttonBlue = buttonBlue/255

self.createButton ({
    ['click_function'] = 'spendFiveSpice',
    ['label'] = 'Spend 5 Spice',
    ['function_owner'] = self,
    ['position'] = {2.75, 0.9, 7.75},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 1200,
    ['height'] = 250,
    ['font_size'] = 100,
    ['color'] = {buttonRed, buttonGreen, buttonBlue},
    ['font_color'] = "White"
  })
  self.createButton ({
    ['click_function'] = 'spendOneSpice',
    ['label'] = 'Spend 1 Spice',
    ['function_owner'] = self,
    ['position'] = {2.75, 0.9, 7},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 1200,
    ['height'] = 250,
    ['font_size'] = 100,
    ['color'] = {buttonRed, buttonGreen, buttonBlue},
    ['font_color'] = "White"
  })

  buttonRed = 0
  buttonGreen = 153
  buttonBlue = 255

  buttonRed = buttonRed/255
  buttonGreen = buttonGreen/255
  buttonBlue = buttonBlue/255

  self.createButton ({
    ['click_function'] = 'spendWater',
    ['label'] = 'Spend 1 Water',
    ['function_owner'] = self,
    ['position'] = {-0.65, 0.9, 7},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 1200,
    ['height'] = 250,
    ['font_size'] = 100,
    ['color'] = {buttonRed, buttonGreen, buttonBlue},
    ['font_color'] = "White"
  })

  if getObjectFromGUID(firstPlayerToken).getVar("riseIX") == 1 then
    buttonRed = 25
    buttonGreen = 62
    buttonBlue = 52

    buttonRed = buttonRed/255
    buttonGreen = buttonGreen/255
    buttonBlue = buttonBlue/255

    self.createButton ({
      ['click_function'] = 'sendNegotiator',
      ['label'] = 'Send 1 Negotiator',
      ['function_owner'] = self,
      ['position'] = {-0.65, 0.9, 7.75},
      ['rotation'] =  {0, 0, 0},
      ['width'] = 1200,
      ['height'] = 250,
      ['font_size'] = 100,
      ['color'] = {buttonRed, buttonGreen, buttonBlue},
      ['font_color'] = "White"
    })
  end

  buttonRed = 128
  buttonGreen = 128
  buttonBlue = 128

  buttonRed = buttonRed/255
  buttonGreen = buttonGreen/255
  buttonBlue = buttonBlue/255

  self.createButton ({
    ['click_function'] = 'spendOneSolaris',
    ['label'] = 'Spend 1 Solaris',
    ['function_owner'] = self,
    ['position'] = {-4.0, 0.9, 7},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 1200,
    ['height'] = 250,
    ['font_size'] = 100,
    ['color'] = {buttonRed, buttonGreen, buttonBlue},
    ['font_color'] = "White"
  })
  self.createButton ({
    ['click_function'] = 'spendFiveSolaris',
    ['label'] = 'Spend 5 Solaris',
    ['function_owner'] = self,
    ['position'] = {-4.0, 0.9, 7.75},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 1200,
    ['height'] = 250,
    ['font_size'] = 100,
    ['color'] = {buttonRed, buttonGreen, buttonBlue},
    ['font_color'] = "White"
  })

  buttonRed = 20
  buttonGreen = 100
  buttonBlue = 10

  buttonRed = buttonRed/255
  buttonGreen = buttonGreen/255
  buttonBlue = buttonBlue/255

  self.createButton ({
    ['click_function'] = 'addGarrison',
    ['label'] = 'Add 1 to Garrison',
    ['function_owner'] = self,
    ['position'] = {6.30, 0.9, 7},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 1200,
    ['height'] = 250,
    ['font_size'] = 100,
    ['color'] = {buttonRed, buttonGreen, buttonBlue},
    ['font_color'] = "White"
  })
  self.createButton ({
    ['click_function'] = 'addConflict',
    ['label'] = 'Add 1 to Conflict Area',
    ['function_owner'] = self,
    ['position'] = {6.30, 0.9, 7.75},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 1200,
    ['height'] = 250,
    ['font_size'] = 100,
    ['color'] = {buttonRed, buttonGreen, buttonBlue},
    ['font_color'] = "White"
  })
end

function reshuffleDiscard()
  discardArea = GetDeckOrCard(discardZone)

  if discardArea != nil then

  discardArea.flip()
  discardArea.shuffle()
  discardArea.setPositionSmooth(drawSpot, false, true)

  Wait.frames(function()
   drawDeck = GetDeckOrCard(drawDeckZone)
   drawDeck.shuffle()
   drawDeck.shuffle()
  end, 60)

  end
end

function drawHandStart()
  startLuaCoroutine(self, "drawHand")
end

function drawHand()
  ::DrawStart::
  local starterDeck = GetDeckOrCard(starterDeckZone)
  local countCheck = 0
  local tagCheck = ""
  local drawCount = 0

  if starterDeck != nil then
   for i=1, 5 do
     if starterDeck != nil then
       countCheck = starterDeck.getQuantity()
       tagCheck = starterDeck.tag
     end

    if countCheck > 0 and tagCheck == "Deck" then
      if starterDeck != nil then
        starterDeck.deal(1, boardColor)
        drawCount = drawCount + 1
        starterDeck = GetDeckOrCard(starterDeckZone)
      end
    else
      if starterDeck != nil then
        starterDeck.deal(1, boardColor)
        drawCount = drawCount + 1
        if drawCount < 5 then
          reshuffleDiscard()
        end

        local Time = os.clock() + 2.0
          while os.clock() < Time do
            coroutine.yield(0)
          end

        starterDeck = GetDeckOrCard(starterDeckZone)
      end
    end
  end
 else
   reshuffleDiscard()

   local Time = os.clock() + 2.0
     while os.clock() < Time do
       coroutine.yield(0)
     end
   goto DrawStart
 end

  return 1
end

function drawCard()
  startLuaCoroutine(self, "drawCardRevised")
end

function drawCardRevised()
  ::DrawStart::
  local starterDeck = GetDeckOrCard(starterDeckZone)

  if starterDeck != nil then
    if starterDeck.getQuantity() > 0 then
      if starterDeck != nil then
        starterDeck.deal(1, boardColor)
        starterDeck = GetDeckOrCard(starterDeckZone)
      end
    else
      if starterDeck != nil then
        starterDeck.deal(1, boardColor)
        --reshuffleDiscard()
      end
    end
  else
    reshuffleDiscard()

    local Time = os.clock() + 2.0
      while os.clock() < Time do
        coroutine.yield(0)
        end
      goto DrawStart
  end

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

function spendOneSpice()
  local items = getObjectFromGUID(playerBoard).getObjects()
  local check = 0

  for _, item in ipairs(items) do
    if item.getName() == "1 Spice" then
      getObjectFromGUID("b70325").putObject(item)
      check = 1
      break
    end
  end

  if check == 0 then
   for _, item in ipairs(items) do
    if item.getName() == "5 Spice" then
      getObjectFromGUID("b70325").putObject(item)

      params = {"", "Green"}
      getObjectFromGUID(spiceOneBag).call("makeSpiceStart", params)

      check = 1
      break
    end
   end
  end

  if check == 0 then
    if Player["Green"].seated then
    printToColor("No 1 Spice Available!", "Green")
    end
  end
end

function spendFiveSpice()
  local items = getObjectFromGUID(playerBoard).getObjects()
  local check = 0

  for _, item in ipairs(items) do
    if item.getName() == "5 Spice" then
      getObjectFromGUID("b70325").putObject(item)
      check = 1
      break
    end
  end

  local fiveCount = 0

  for _, item in ipairs(items) do
    if item.getName() == "1 Spice" then
      fiveCount = fiveCount + 1
    end
  end

  if fiveCount > 4 and check == 0 then
    check = 1
    local countDown= 5
    for _, item in ipairs(items) do
      if item.getName() == "1 Spice" then
        getObjectFromGUID(spiceOneBag).putObject(item)
        countDown = countDown - 1
        if countDown == 0 then
          break
        end
      end
    end
  end

  if check == 0 then
    if Player["Green"].seated then
    printToColor("No 5 Spice Available!", "Green")
    end
  end
end

function spendWater()
  local items = getObjectFromGUID(playerBoard).getObjects()
  local check = 0

  for _, item in ipairs(items) do
    if item.getName() == "Water" and item.tag == "Tile" then
      getObjectFromGUID(waterBag).putObject(item)
      check = 1
      break
    end
  end

  if check == 0 then
    if Player["Green"].seated then
    printToColor("No Water Available!", "Green")
    end
  end

end

function spendOneSolaris()
  local items = getObjectFromGUID(playerBoard).getObjects()
  local check = 0

  for _, item in ipairs(items) do
    if item.getName() == "1 Solaris" then
      --getObjectFromGUID("b70325").putObject(item)
      getObjectFromGUID(solarisOneBag).putObject(item)
      check = 1
      break
    end
  end

  if check == 0 then
   for _, item in ipairs(items) do
    if item.getName() == "5 Solaris" then
      --getObjectFromGUID("b70325").putObject(item)
      getObjectFromGUID(solarisFiveBag).putObject(item)

      params = {"", "Green"}
      getObjectFromGUID(solarisOneBag).call("makeSolarisStart", params)

      check = 1
      break
    end
   end
  end

  if check == 0 then
    if Player["Green"].seated then
    printToColor("No 1 Solaris Available!", "Green")
    end
  end
end

function spendFiveSolaris()
  local items = getObjectFromGUID(playerBoard).getObjects()
  local check = 0

  for _, item in ipairs(items) do
    if item.getName() == "5 Solaris" then
      --getObjectFromGUID("b70325").putObject(item)
      getObjectFromGUID(solarisFiveBag).putObject(item)
      check = 1
      break
    end
  end

  local fiveCount = 0

  for _, item in ipairs(items) do
    if item.getName() == "1 Solaris" then
      fiveCount = fiveCount + 1
    end
  end

  if fiveCount > 4 and check == 0 then
    check = 1
    local countDown= 5
    for _, item in ipairs(items) do
      if item.getName() == "1 Solaris" then
        getObjectFromGUID(solarisOneBag).putObject(item)
        countDown = countDown - 1
        if countDown == 0 then
          break
        end
      end
    end
  end

  if check == 0 then
    if Player["Green"].seated then
    printToColor("No 5 Solaris Available!", "Green")
    end
  end
end

function addGarrison()
  math.randomseed(os.time())
  local items = getObjectFromGUID(supplyZone).getObjects()
  for _, item in ipairs(items) do
    if item.getName() == "Green" and item.tag == "Block" then
      item.setPositionSmooth({(math.random(9,10) + 0.2),2, (-math.random() - math.random() + 0.1)},false,true)
      item.setRotationSmooth({0,0,0})
      break
    end
  end
end

function addDreadnought()
  math.randomseed(os.time())
  local items = getObjectFromGUID(playerBoard).getObjects()
  for _, item in ipairs(items) do
    if item.getName() == "Green Dreadnought" then
      item.setPositionSmooth({(math.random(9,10) + 0.2),2, (-math.random() - math.random() + 0.1)},false,true)
      item.setRotationSmooth({0,180,0})
      break
    end
  end
end

function addDreadConflict()
  local dreadCheck = 0
  math.randomseed(os.time())
  local items = getObjectFromGUID(garrisonZone).getObjects()
  for _, item in ipairs(items) do
    if item.getName() == "Green Dreadnought" then
      item.setPositionSmooth({(math.random(6,7) + 0.7),2, (-math.random() - math.random() - 0.2)},false,true)
      item.setRotationSmooth({0,180,0})
      dreadCheck = 1
      break
    end
  end
  if dreadCheck == 0 then
    return 0
  else
    return 1
  end
end

function addConflict()
  math.randomseed(os.time())
  local items = getObjectFromGUID(garrisonZone).getObjects()
  for _, item in ipairs(items) do
    if item.getName() == "Green" and item.tag == "Block" then
      item.setPositionSmooth({(math.random(6,7) + 0.7),2, (-math.random() - math.random() - 0.2)},false,true)
      item.setRotationSmooth({0,0,0})
      break
    end
  end
end

function sendNegotiator()
  math.randomseed(os.time())
  local items = getObjectFromGUID(supplyZone).getObjects()
  for _, item in ipairs(items) do
    if item.getName() == "Green" and item.tag == "Block" then
      item.setPositionSmooth({(math.random(16,17) + 0.45), 2, (math.random(7,9) + 0.25)},false,true)
      item.setRotationSmooth({0,0,0})
      broadcastToAll("Green Player sent a Negotiator to IX", stringColorToRGB("Green"))
      break
    end
  end
end

function sendSpecimen()
  math.randomseed(os.time())
  local adjustValueX = ((math.random(1,6)) / 10)
  local adjustValueZ = ((math.random(1,6)) / 10)
  local items = getObjectFromGUID(supplyZone).getObjects()
  for _, item in ipairs(items) do
    if item.getName() == "Green" and item.tag == "Block" then
      item.setPositionSmooth({(math.random(2,4) + adjustValueX), 13, (math.random(21,22) + adjustValueZ)},false,true)
      item.setRotationSmooth({0,0,0})
      broadcastToAll("Green Player sent a Specimen to the Axolotl Tanks", stringColorToRGB("Green"))
      break
    end
  end
end

function rivalSetup()
  buttons = {}
  buttonIndex = ""

  buttons = self.getButtons()
  if buttons != nil then
    for i, v in pairs(buttons) do
      if v.label == "Draw 5 Cards" then
        buttonIndex = i-1
      end
    end
  end
  self.removeButton(buttonIndex)

  buttons = self.getButtons()
  if buttons != nil then
    for i, v in pairs(buttons) do
      if v.label == "Draw 1 Card" then
        buttonIndex = i-1
      end
    end
  end
  self.removeButton(buttonIndex)

  buttons = self.getButtons()
  if buttons != nil then
    for i, v in pairs(buttons) do
      if v.label == "Reshuffle Discard" then
        buttonIndex = i-1
      end
    end
  end
  self.removeButton(buttonIndex)

  buttons = self.getButtons()
  if buttons != nil then
    for i, v in pairs(buttons) do
      if v.label == "Discard Revealed Cards" then
        buttonIndexFour = i-1
      end
    end
  end
  self.removeButton(buttonIndexFour)
end

function rivalButtons()
  buttonRed = 255
  buttonGreen = 084
  buttonBlue = 0

  buttonRed = buttonRed/255
  buttonGreen = buttonGreen/255
  buttonBlue = buttonBlue/255

  self.createButton ({
    ['click_function'] = 'takeOneSpice',
    ['label'] = 'Take 1 Spice',
    ['function_owner'] = self,
    ['position'] = {2.75, 0.9, 6},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 1200,
    ['height'] = 250,
    ['font_size'] = 100,
    ['color'] = {buttonRed, buttonGreen, buttonBlue},
    ['font_color'] = "White"
  })

  buttonRed = 0
  buttonGreen = 153
  buttonBlue = 255

  buttonRed = buttonRed/255
  buttonGreen = buttonGreen/255
  buttonBlue = buttonBlue/255

  self.createButton ({
    ['click_function'] = 'takeWater',
    ['label'] = 'Take 1 Water',
    ['function_owner'] = self,
    ['position'] = {-0.65, 0.9, 6},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 1200,
    ['height'] = 250,
    ['font_size'] = 100,
    ['color'] = {buttonRed, buttonGreen, buttonBlue},
    ['font_color'] = "White"
  })

  buttonRed = 128
  buttonGreen = 128
  buttonBlue = 128

  buttonRed = buttonRed/255
  buttonGreen = buttonGreen/255
  buttonBlue = buttonBlue/255

  self.createButton ({
    ['click_function'] = 'takeOneSolaris',
    ['label'] = 'Take 1 Solaris',
    ['function_owner'] = self,
    ['position'] = {-4, 0.9, 6},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 1200,
    ['height'] = 250,
    ['font_size'] = 100,
    ['color'] = {buttonRed, buttonGreen, buttonBlue},
    ['font_color'] = "White"
  })

  self.createButton ({
    ['click_function'] = 'drawIntrigue',
    ['label'] = 'Draw 1 Intrigue Card',
    ['function_owner'] = self,
    ['position'] = {-5.58, 0.9, -3.0},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 1200,
    ['height'] = 250,
    ['font_size'] = 100,
    ['color'] = {0,0,0},
    ['font_color'] = "Yellow"
  })
end


function takeOneSpice()
  getObjectFromGUID(spiceOneBag).takeObject({position = spiceBowl, rotation = {0,180,0}})
end


function takeWater()
  getObjectFromGUID(waterBag).takeObject({position = waterBowl, rotation = {0,180,0}})
end

function takeOneSolaris()
  getObjectFromGUID(solarisOneBag).takeObject({position = solarisBowl, rotation = {0,180,0}})
end

function drawIntrigue()
  local intrigueDeck = GetDeckOrCard(intrigueZone)
  local deckPos = getObjectFromGUID(drawDeckZone).getPosition()
  deckPos.y = 2
  if intrigueDeck.name == "Deck" or intrigueDeck.name == "DeckCustom" then
    local cardPull = intrigueDeck.takeObject({position = deckPos, flip = false})
  elseif intrigueDeck.name == "Card" or intrigueDeck.name == "CardCustom" then
    cardPull = intrigueDeck
    local cardPull = intrigueDeck.takeObject({position = deckPos, flip = false})
  end
end

function discardIntrigue()
  playerHand = Player["Green"].getHandObjects()
  for _, obj in ipairs(playerHand) do
    local scale = obj.getScale()
    if round(scale.x,2) == 0.88 and round(scale.z,2) == 0.88 then
      if obj.getDescription() == "Intrigue" then
        obj.setPosition({-18.00, 2.00, 17.81})
        obj.setRotation({0.00, 180.00, 180.00})
        break
      end
    end
  end
end

function discardIntrigueRival()
  local intriguePile = GetDeckOrCard("2570f5")
  if intriguePile != nil then
    if intriguePile.name == "Card" or intriguePile.name == "CardCustom" then
      intriguePile.setPositionSmooth({-18.00, 2.00, 17.81}, false, true)
      intriguePile.setRotation({0.00, 180.00, 180.00})
    elseif intriguePile.name == "Deck" or intriguePile.name == "DeckCustom" then
      local objPull = intriguePile.takeObject()
      objPull.setPositionSmooth({-18.00, 2.00, 17.81}, false, true)
      objPull.setRotation({0.00, 180.00, 180.00})
    end
  end
end

function onObjectEnterScriptingZone(zone,obj)
  if zone.getGUID() == drawDeckZone and Global.getVar("rivals")[4] == 1 then
   if obj.name == "Card" or obj.name == "CardCustom" then
    local vpCheck = 0
    local scaleCheck = obj.getScale()
    if round(scaleCheck.x,2) == 0.88 then
     Wait.frames(function()
      local deckCheck = GetDeckOrCard(drawDeckZone)
      if deckCheck != nil then
        if vpCheck == 0 and deckCheck.name == "Deck" or deckCheck.name == "DeckCustom" then
          if deckCheck.getQuantity() == 3 then
            vpCheck = 1
            deckCheck.setPositionSmooth({-18.00, 3.00, 17.81}, false, true)
            getObjectFromGUID("2da390").call("upGreen",{})
          end
        end
      end
     end,60)
    end
   end
  end
end

function discardReveals()
  local discardRevealPos = getObjectFromGUID(discardZone).getPosition()
  local revealCards = getObjectFromGUID(revealButton).getVar("revealedCards")
  local revealAreaItems = getObjectFromGUID(revealArea).getObjects()

  discardRevealPos.y = 2

  for _, cardR in ipairs(revealCards) do
    if getObjectFromGUID(cardR) then
      getObjectFromGUID(cardR).setPositionSmooth(discardRevealPos,false,true)
    end
  end

  getObjectFromGUID(revealButton).call("resetReveal",{})

  for _, itemR in ipairs (revealAreaItems) do
    if itemR.tag == "Card" or itemR.tag == "CardCustom" or itemR.tag == "Deck" or itemR.tag == "DeckCustom" then
      itemR.setPositionSmooth(discardRevealPos,false,true)
    end
  end
end

function round(num, dec)
  local mult = 10^(dec or 0)
  return math.floor(num * mult + 0.5) / mult
end

-- ===== Troop Supply 1bf397 (2417 chars) =====
--Counting Bowl    by MrStump
timerID = ""

validCountItemList = {
    ["Green"] = 1,
}

function onLoad()
    timerID = self.getGUID()..math.random(9999999999999)

    self.createButton({
        label="", click_function="none", function_owner=self,
        position={0,1.4,-1.8}, rotation={0,180,0}, height=00, width=0,
        font_color={1,1,1}, font_size=250
    })

    Timer.create({
        identifier=timerID,
        function_name="countItems", function_owner=self,
        repetitions=0, delay=0.75
    })
end

--Activated once per second, counts items in bowls
function countItems()
    local totalValue = 0
    local itemsInBowl = findItemsInSphere()
    --Go through all items found by the cast
    for _, entry in ipairs(itemsInBowl) do
        --Ignore the bowl
        if entry.hit_object ~= self then
            local tableEntry = validCountItemList[entry.hit_object.getName()]
            --Ignore if not in validCountItemList
            if tableEntry ~= nil then
                local descValue = tonumber(entry.hit_object.getDescription())
                local stackMult = math.abs(entry.hit_object.getQuantity())
                --Use value in description if available
                if descValue ~= nil then
                    totalValue = totalValue + descValue * stackMult
                else
                    --Otherwise use the value in validCountItemList
                    totalValue = totalValue + tableEntry * stackMult
                end
            end
        end
    end
    --Updates the number display
    if totalValue == 1 then
      totalValue = (totalValue .. " Troop")
    elseif totalValue > 1 then
      totalValue = (totalValue .. " Troops")
    elseif totalValue == 0 then
      totalValue = ("0 Troops")
    end
    self.editButton({index=0, label=totalValue})
end

--Gets the items in the bowl for countItems to count
function findItemsInSphere()
    --Find scaling factor
    local scale = self.getScale()
    --Set position for the sphere
    local pos = self.getPosition()
    pos.y=pos.y+(1.25*scale.y)
    --Ray trace to get all objects
    return Physics.cast({
        origin=pos, direction={0,1,0}, type=2, max_distance=0,
        size={3.4*scale.x,3.4*scale.y,3.4*scale.z}, --debug=true
    })
end

function onDestroy()
  --if timerID ~= nil then
    --Timer.destroy(timerID)
  --end
end

-- ===== Water 2a5d7c (3544 chars) =====
--Counting Bowl    by MrStump
timerID = ""

validCountItemList = {
    ["Water"] = 1,
}

soloGame = 0
vpCheck = 0

function onLoad(saved_game_data)
    if saved_game_data ~= "" and saved_game_data ~= nil then
      local loaded_data = JSON.decode(saved_game_data)
      soloGame = loaded_data[1]
      vpCheck = loaded_data[2]
    else
      soloGame = 0
      vpCheck = 0
    end

    timerID = self.getGUID()..math.random(9999999999999)

    self.createButton({
        label="", click_function="none", function_owner=self,
        position={0,1.4,-1.5}, rotation={0,180,0}, height=00, width=0,
        font_color={1,1,1}, font_size=250
    })

    Timer.create({
        identifier=timerID,
        function_name="countItems", function_owner=self,
        repetitions=0, delay=0.75
    })
end

function onSave()
  local sg = soloGame
  local vpc = vpCheck

  local data_to_save = {sg,vpc}

  saved_game_data = JSON.encode(data_to_save)

  return saved_game_data
end

--Activated once per second, counts items in bowls
function countItems()
    local totalValue = 0
    local itemsInBowl = findItemsInSphere()
    --Go through all items found by the cast
    for _, entry in ipairs(itemsInBowl) do
        --Ignore the bowl
        if entry.hit_object ~= self then
            local tableEntry = validCountItemList[entry.hit_object.getName()]
            --Ignore if not in validCountItemList
            if tableEntry ~= nil then
                local descValue = tonumber(entry.hit_object.getDescription())
                local stackMult = math.abs(entry.hit_object.getQuantity())
                --Use value in description if available
                if descValue ~= nil then
                    totalValue = totalValue + descValue * stackMult
                else
                    --Otherwise use the value in validCountItemList
                    totalValue = totalValue + tableEntry * stackMult
                end
            end
        end
    end
    --Updates the number display
    spendCheck = totalValue
    totalValue = (totalValue .. " Water")

    UI.setValue("WATERgreen", totalValue)

    self.editButton({index=0, label=totalValue})
    if spendCheck >= 3 and vpCheck == 0 and soloGame == 1 then
      vpCheck = 1
      startLuaCoroutine(self, "spendResources")
      getObjectFromGUID("2da390").call("upGreen",{})
    end
end

--Gets the items in the bowl for countItems to count
function findItemsInSphere()
    --Find scaling factor
    local scale = self.getScale()
    --Set position for the sphere
    local pos = self.getPosition()
    pos.y=pos.y+(1.25*scale.y)
    --Ray trace to get all objects
    return Physics.cast({
        origin=pos, direction={0,1,0}, type=2, max_distance=0,
        size={3.4*scale.x,3.4*scale.y,3.4*scale.z}, --debug=true
    })
end

function onDestroy()
  --if timerID ~= nil then
    --Timer.destroy(timerID)
  --end
end

function spendResources()
  local playerBoard = "231215"
  local itemCount = 3

  if soloGame == 1 then
    local rivalItems = getObjectFromGUID(playerBoard).getObjects()

    for _, item in ipairs(rivalItems) do
      if item.getName() == "Water" and itemCount > 0 and item.getGUID() != self.getGUID() then

        local Time = os.clock() + 0.2
        while os.clock() < Time do
          coroutine.yield(0)
        end

        getObjectFromGUID("b70325").putObject(item)
        itemCount = itemCount - 1
      end
    end
  end
  vpCheck = 0
  return 1
end

function setSolo()
  soloGame = 1
end

-- ===== Solaris 917162 (3812 chars) =====
--Counting Bowl    by MrStump
timerID = ""

validCountItemList = {
    ["5 Solaris"] = 5,
    ["1 Solaris"] = 1,
}

soloGame = 0
vpCheck = 0

function onLoad(saved_game_data)
    if saved_game_data ~= "" and saved_game_data ~= nil then
      local loaded_data = JSON.decode(saved_game_data)
      soloGame = loaded_data[1]
      vpCheck = loaded_data[2]
    else
      soloGame = 0
      vpCheck = 0
    end

    timerID = self.getGUID()..math.random(9999999999999)

    self.createButton({
        label="", click_function="none", function_owner=self,
        position={0,1.4,-1.5}, rotation={0,180,0}, height=00, width=0,
        font_color={1,1,1}, font_size=250
    })

    Timer.create({
        identifier=timerID,
        function_name="countItems", function_owner=self,
        repetitions=0, delay=0.75
    })
end

function onSave()
  local sg = soloGame
  local vpc = vpCheck

  local data_to_save = {sg,vpc}

  saved_game_data = JSON.encode(data_to_save)

  return saved_game_data
end

--Activated once per second, counts items in bowls
function countItems()
    local totalValue = 0
    local itemsInBowl = findItemsInSphere()
    --Go through all items found by the cast
    for _, entry in ipairs(itemsInBowl) do
        --Ignore the bowl
        if entry.hit_object ~= self then
            local tableEntry = validCountItemList[entry.hit_object.getName()]
            --Ignore if not in validCountItemList
            if tableEntry ~= nil then
                local descValue = tonumber(entry.hit_object.getDescription())
                local stackMult = math.abs(entry.hit_object.getQuantity())
                --Use value in description if available
                if descValue ~= nil then
                    totalValue = totalValue + descValue * stackMult
                else
                    --Otherwise use the value in validCountItemList
                    totalValue = totalValue + tableEntry * stackMult
                end
            end
        end
    end
    --Updates the number display
    spendCheck = totalValue
    totalValue = (totalValue .. " Solaris")

    UI.setValue("SOLARISgreen", totalValue)

    self.editButton({index=0, label=totalValue})
    if spendCheck >= 7 and vpCheck == 0 and soloGame == 1 then
      vpCheck = 1
      startLuaCoroutine(self, "spendResources")
      getObjectFromGUID("2da390").call("upGreen",{})
    end
end

--Gets the items in the bowl for countItems to count
function findItemsInSphere()
    --Find scaling factor
    local scale = self.getScale()
    --Set position for the sphere
    local pos = self.getPosition()
    pos.y=pos.y+(1.25*scale.y)
    --Ray trace to get all objects
    return Physics.cast({
        origin=pos, direction={0,1,0}, type=2, max_distance=0,
        size={3.4*scale.x,3.4*scale.y,3.4*scale.z}, --debug=true
    })
end

function onDestroy()
  --if timerID ~= nil then
    --Timer.destroy(timerID)
  --end
end

function spendResources()
  local playerBoard = "231215"
  local itemCount = 7

  if soloGame == 1 then
    local rivalItems = getObjectFromGUID(playerBoard).getObjects()

    for _, item in ipairs(rivalItems) do
      if item.getName() == "5 Solaris" and itemCount > 4 then

        local Time = os.clock() + 0.2
        while os.clock() < Time do
          coroutine.yield(0)
        end

        getObjectFromGUID("b70325").putObject(item)
        itemCount = itemCount - 5
      elseif item.getName() == "1 Solaris" and itemCount > 0 then

        local Time = os.clock() + 0.2
        while os.clock() < Time do
          coroutine.yield(0)
        end

        getObjectFromGUID("b70325").putObject(item)
        itemCount = itemCount - 1
      end
    end
  end
  vpCheck = 0
  return 1
end

function setSolo()
  soloGame = 1
end

-- ===== Spice 6fae7e (5501 chars) =====
--Counting Bowl    by MrStump
timerID = ""

validCountItemList = {
    ["5 Spice"] = 5,
    ["1 Spice"] = 1,
}

soloGame = 0
vpCheck = 0
spiceCount = 0
firstPlayerToken = "784534"

function onLoad(saved_game_data)
    if saved_game_data ~= "" and saved_game_data ~= nil then
      local loaded_data = JSON.decode(saved_game_data)
      soloGame = loaded_data[1]
      vpCheck = loaded_data[2]
    else
      soloGame = 0
      vpCheck = 0
    end

    timerID = self.getGUID()..math.random(9999999999999)

    self.createButton({
        label="", click_function="none", function_owner=self,
        position={0,1.4,-1.5}, rotation={0,180,0}, height=00, width=0,
        font_color={1,1,1}, font_size=250
    })

    Timer.create({
        identifier=timerID,
        function_name="countItems", function_owner=self,
        repetitions=0, delay=0.75
    })
end

function onSave()
  local sg = soloGame
  local vpc = vpCheck

  local data_to_save = {sg,vpc}

  saved_game_data = JSON.encode(data_to_save)

  return saved_game_data
end

--Activated once per second, counts items in bowls
function countItems()
    local totalValue = 0
    local itemsInBowl = findItemsInSphere()
    --Go through all items found by the cast
    for _, entry in ipairs(itemsInBowl) do
        --Ignore the bowl
        if entry.hit_object ~= self then
            local tableEntry = validCountItemList[entry.hit_object.getName()]
            --Ignore if not in validCountItemList
            if tableEntry ~= nil then
                local descValue = tonumber(entry.hit_object.getDescription())
                local stackMult = math.abs(entry.hit_object.getQuantity())
                --Use value in description if available
                if descValue ~= nil then
                    totalValue = totalValue + descValue * stackMult
                else
                    --Otherwise use the value in validCountItemList
                    totalValue = totalValue + tableEntry * stackMult
                end
            end
        end
    end
    --Updates the number display
    spendCheck = totalValue
    spiceCount = totalValue
    totalValue = (totalValue .. " Spice")


    UI.setValue("SPICEgreen", totalValue)

    local intrigueCheck = GetDeckOrCard("2570f5")
    if intrigueCheck != nil and Global.getVar("inProgress") == 1 and Global.getVar("rivals")[4] == 1 then
      local intrigueCount = intrigueCheck.getQuantity()
      if intrigueCount == -1 then
        intrigueCount = 1
      end
      UI.setValue("INTRIGUEgreen", intrigueCount)
    elseif intrigueCheck == nil and Global.getVar("inProgress") == 1 and Global.getVar("rivals")[4] == 1 then
      intrigueCount = 0
      UI.setValue("INTRIGUEgreen", intrigueCount)
    elseif Global.getVar("inProgress") == 1 and Global.getVar("rivals")[4] != 1 then
      local handQuery = Player["Green"].getHandObjects(1)
      local intrigueCount = 0

      for _, cardItem in ipairs(handQuery) do
        if cardItem.getDescription() == "Intrigue" then
          intrigueCount = intrigueCount + 1
        end
      end
      UI.setValue("INTRIGUEgreen", intrigueCount)
    end

    self.editButton({index=0, label=totalValue})
    if spendCheck >= 7 and vpCheck == 0 and soloGame == 1 then
      vpCheck = 1
      startLuaCoroutine(self, "spendResources")
      --getObjectFromGUID("2da390").call("upGreen",{})
    end
end

--Gets the items in the bowl for countItems to count
function findItemsInSphere()
    --Find scaling factor
    local scale = self.getScale()
    --Set position for the sphere
    local pos = self.getPosition()
    pos.y=pos.y+(1.25*scale.y)
    --Ray trace to get all objects
    return Physics.cast({
        origin=pos, direction={0,1,0}, type=2, max_distance=0,
        size={3.4*scale.x,3.4*scale.y,3.4*scale.z}, --debug=true
    })
end

function onDestroy()
  --if timerID ~= nil then
    --Timer.destroy(timerID)
  --end
end

function spendResources()
  local playerBoard = "231215"
  local itemCount = 7
  local conflictCount = 0
  local ixCheck = 0

  for _, conflictObj in ipairs(getObjectFromGUID("4a21d4").getObjects()) do
    if conflictObj.tag == "Deck" or conflictObj.tag == "DeckCustom" then
      conflictCount = conflictObj.getQuantity()
    end
  end

  if conflictCount >= (7 - getObjectFromGUID(firstPlayerToken).getVar("epicMode")) and getObjectFromGUID(firstPlayerToken).getVar("riseIX") == 1 then
    ixCheck = 1
  end

  if soloGame == 1 and ixCheck == 1 then
    for i=1, itemCount do
      getObjectFromGUID("f8a49f").call("spendOneSpice", {})
      itemCount = itemCount - 1

      local Time = os.clock() + 0.5
      while os.clock() < Time do
        coroutine.yield(0)
      end
    end
    getObjectFromGUID("2da390").call("upGreen",{})

  elseif soloGame == 1 and getObjectFromGUID(firstPlayerToken).getVar("riseIX") == 0 then
    for i=1, itemCount do
      getObjectFromGUID("f8a49f").call("spendOneSpice", {})
      itemCount = itemCount - 1

      local Time = os.clock() + 0.5
      while os.clock() < Time do
        coroutine.yield(0)
      end
    end
    getObjectFromGUID("2da390").call("upGreen",{})

  end
  vpCheck = 0
  return 1
end

function setSolo()
  soloGame = 1
end

function GetDeckOrCard(zoneGUID)
  for _, obj in ipairs(getObjectFromGUID(zoneGUID).getObjects()) do
    if obj.name == "Card" or obj.name == "CardCustom" or obj.name == "Deck" or obj.name == "DeckCustom" then
      return obj
    end
  end

 return nil
end

-- ===== Duke Atreides 9b6cdc (1911 chars) =====
function onLoad()
  if Vector.equals(self.getPosition(), Vector({-12.00, 1.08, 22.80}), 0.02) then
  self.createButton({
     click_function = "claimLeader",
     function_owner = self,
     label          = "Claim Leader",
     position       = {0,0.2,0.4},
     rotation       = {0, 0, 0},
     scale          = {0.5, 1, 0.5},
     width          = 700,
     height         = 150,
     tooltip        = "",
     font_color     = {1, 1, 1},
     font_size      = 85,
     color          = "Black"
     })
  end
end 
	 
function claimLabel()
  self.createButton({
     click_function = "claimLeader",
     function_owner = self,
     label          = "Claim Leader",
     position       = {0,0.2,0.4},
     rotation       = {0, 0, 0},
     scale          = {0.5, 1, 0.5},
     width          = 700,
     height         = 150,
     tooltip        = "",
     font_color     = {1, 1, 1},
     font_size      = 85,
     color          = "Black"
     })
end

function claimLeader(GO, color)
  if color == "Red" then
    leaderPos = {-40.00, 2, -12.89}
    leaderRot = {0.00, 180.00, 0.00}
    GO.setPositionSmooth(leaderPos)
    GO.setRotationSmooth(leaderRot)
    GO.clearButtons()
  elseif color == "Blue" then
    leaderPos = {-15.00, 2, -12.89}
    leaderRot = {0.00, 180.00, 0.00}
    GO.setPositionSmooth(leaderPos)
    GO.setRotationSmooth(leaderRot)
    GO.clearButtons()
  elseif color == "Orange" then
    leaderPos = {15.00, 2, -12.89}
    leaderRot = {0.00, 180.00, 0.00}
    GO.setPositionSmooth(leaderPos)
    GO.setRotationSmooth(leaderRot)
    GO.clearButtons()
  elseif color == "Green" then
    leaderPos = {40.00, 2, -12.89}
    leaderRot = {0.00, 180.00, 0.00}
    GO.setPositionSmooth(leaderPos)
    GO.setRotationSmooth(leaderRot)
    GO.clearButtons()
  else
    printToAll("Cannot Select Leader Until the Player is Seated!")
  end
end

-- ===== Custom_Board a0fa97 (20752 chars) =====
discardZone = "c27bfc"
drawDeckZone = "97ba78"
supplyZone = "58f873"
garrisonZone = "e5f0d0"
drawSpot = {-44.61, 3, -12.89}
starterDeckZone = "97ba78"
boardColor = "Red"
playerBoard = "bd39f6"
intrigueZone = "e9f30d"
rivalStatus = 0
revealButton = "e1c44b"
revealArea = "38b5ef"
firstPlayerToken = "784534"

solarisBowl = {-49.00, 3.5, -13.00}
waterBowl = {-49.00, 3.5, -16.00}
spiceBowl = {-49.00, 3.5, -19.00}

solarisFiveBag = "3f6168"
solarisOneBag = "5090e6"
waterBag = "400db5"
spiceFiveBag = "3d38e5"
spiceOneBag = "85289a"

function boardSetup()
  buttonRed = 185
  buttonGreen = 0
  buttonBlue = 0

  buttonRed = buttonRed/255
  buttonGreen = buttonGreen/255
  buttonBlue = buttonBlue/255

  self.clearButtons()
  self.createButton ({
    ['click_function'] = 'reshuffleDiscard',
    ['label'] = 'Reshuffle Discard',
    ['function_owner'] = self,
    ['position'] = {5.58, 0.9, -3.0},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 1200,
    ['height'] = 250,
    ['font_size'] = 100,
    ['color'] = {buttonRed, buttonGreen, buttonBlue},
    ['font_color'] = "White"
  })
  self.createButton ({
    ['click_function'] = 'discardReveals',
    ['label'] = 'Discard Revealed Cards',
    ['function_owner'] = self,
    ['position'] = {5.58, 0.9, -2.25},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 1200,
    ['height'] = 250,
    ['font_size'] = 100,
    ['color'] = {0,0,0},
    ['font_color'] = "White"
  })
  self.createButton ({
    ['click_function'] = 'drawHandStart',
    ['label'] = 'Draw 5 Cards',
    ['function_owner'] = self,
    ['position'] = {-5.58, 0.9, -3.0},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 1200,
    ['height'] = 250,
    ['font_size'] = 100,
    ['color'] = {buttonRed, buttonGreen, buttonBlue},
    ['font_color'] = "White"
  })
  self.createButton ({
    ['click_function'] = 'drawCard',
    ['label'] = 'Draw 1 Card',
    ['function_owner'] = self,
    ['position'] = {-5.58, 0.9, -2.25},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 1200,
    ['height'] = 250,
    ['font_size'] = 100,
    ['color'] = {buttonRed, buttonGreen, buttonBlue},
    ['font_color'] = "White"
  })

  buttonRed = 255
  buttonGreen = 084
  buttonBlue = 0

  buttonRed = buttonRed/255
  buttonGreen = buttonGreen/255
  buttonBlue = buttonBlue/255

self.createButton ({
    ['click_function'] = 'spendFiveSpice',
    ['label'] = 'Spend 5 Spice',
    ['function_owner'] = self,
    ['position'] = {2.75, 0.9, 7.75},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 1200,
    ['height'] = 250,
    ['font_size'] = 100,
    ['color'] = {buttonRed, buttonGreen, buttonBlue},
    ['font_color'] = "White"
  })
  self.createButton ({
    ['click_function'] = 'spendOneSpice',
    ['label'] = 'Spend 1 Spice',
    ['function_owner'] = self,
    ['position'] = {2.75, 0.9, 7},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 1200,
    ['height'] = 250,
    ['font_size'] = 100,
    ['color'] = {buttonRed, buttonGreen, buttonBlue},
    ['font_color'] = "White"
  })

  buttonRed = 0
  buttonGreen = 153
  buttonBlue = 255

  buttonRed = buttonRed/255
  buttonGreen = buttonGreen/255
  buttonBlue = buttonBlue/255

  self.createButton ({
    ['click_function'] = 'spendWater',
    ['label'] = 'Spend 1 Water',
    ['function_owner'] = self,
    ['position'] = {-0.65, 0.9, 7},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 1200,
    ['height'] = 250,
    ['font_size'] = 100,
    ['color'] = {buttonRed, buttonGreen, buttonBlue},
    ['font_color'] = "White"
  })

  if getObjectFromGUID(firstPlayerToken).getVar("riseIX") == 1 then
    buttonRed = 25
    buttonGreen = 62
    buttonBlue = 52

    buttonRed = buttonRed/255
    buttonGreen = buttonGreen/255
    buttonBlue = buttonBlue/255

    self.createButton ({
      ['click_function'] = 'sendNegotiator',
      ['label'] = 'Send 1 Negotiator',
      ['function_owner'] = self,
      ['position'] = {-0.65, 0.9, 7.75},
      ['rotation'] =  {0, 0, 0},
      ['width'] = 1200,
      ['height'] = 250,
      ['font_size'] = 100,
      ['color'] = {buttonRed, buttonGreen, buttonBlue},
      ['font_color'] = "White"
    })
  end

  buttonRed = 128
  buttonGreen = 128
  buttonBlue = 128

  buttonRed = buttonRed/255
  buttonGreen = buttonGreen/255
  buttonBlue = buttonBlue/255

  self.createButton ({
    ['click_function'] = 'spendOneSolaris',
    ['label'] = 'Spend 1 Solaris',
    ['function_owner'] = self,
    ['position'] = {-4, 0.9, 7},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 1200,
    ['height'] = 250,
    ['font_size'] = 100,
    ['color'] = {buttonRed, buttonGreen, buttonBlue},
    ['font_color'] = "White"
  })
  self.createButton ({
    ['click_function'] = 'spendFiveSolaris',
    ['label'] = 'Spend 5 Solaris',
    ['function_owner'] = self,
    ['position'] = {-4, 0.9, 7.75},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 1200,
    ['height'] = 250,
    ['font_size'] = 100,
    ['color'] = {buttonRed, buttonGreen, buttonBlue},
    ['font_color'] = "White"
  })

  buttonRed = 185
  buttonGreen = 0
  buttonBlue = 0

  buttonRed = buttonRed/255
  buttonGreen = buttonGreen/255
  buttonBlue = buttonBlue/255

  self.createButton ({
    ['click_function'] = 'addGarrison',
    ['label'] = 'Add 1 to Garrison',
    ['function_owner'] = self,
    ['position'] = {6.30, 0.9, 7},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 1200,
    ['height'] = 250,
    ['font_size'] = 100,
    ['color'] = {buttonRed, buttonGreen, buttonBlue},
    ['font_color'] = "White"
  })
  self.createButton ({
    ['click_function'] = 'addConflict',
    ['label'] = 'Add 1 to Conflict Area',
    ['function_owner'] = self,
    ['position'] = {6.30, 0.9, 7.75},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 1200,
    ['height'] = 250,
    ['font_size'] = 100,
    ['color'] = {buttonRed, buttonGreen, buttonBlue},
    ['font_color'] = "White"
  })
end

function reshuffleDiscard()
  discardArea = GetDeckOrCard(discardZone)

  if discardArea != nil then

  discardArea.flip()
  discardArea.shuffle()
  discardArea.setPositionSmooth(drawSpot, false, true)

  Wait.frames(function()
   drawDeck = GetDeckOrCard(drawDeckZone)
   drawDeck.shuffle()
   drawDeck.shuffle()
  end, 60)

  end
end

function drawHandStart()
  startLuaCoroutine(self, "drawHand")
end

function drawHand()
  ::DrawStart::
  local starterDeck = GetDeckOrCard(starterDeckZone)
  local countCheck = 0
  local tagCheck = ""
  local drawCount = 0

  if starterDeck != nil then
   for i=1, 5 do
     if starterDeck != nil then
       countCheck = starterDeck.getQuantity()
       tagCheck = starterDeck.tag
     end

    if countCheck > 0 and tagCheck == "Deck" then
      if starterDeck != nil then
        starterDeck.deal(1, boardColor)
        drawCount = drawCount + 1
        starterDeck = GetDeckOrCard(starterDeckZone)
      end
    else
      if starterDeck != nil then
        starterDeck.deal(1, boardColor)
        drawCount = drawCount + 1
        if drawCount < 5 then
          reshuffleDiscard()
        end

        local Time = os.clock() + 2.0
          while os.clock() < Time do
            coroutine.yield(0)
          end

        starterDeck = GetDeckOrCard(starterDeckZone)
      end
    end
  end
 else
   reshuffleDiscard()

   local Time = os.clock() + 2.0
     while os.clock() < Time do
       coroutine.yield(0)
     end
   goto DrawStart
 end

  return 1
end

function drawCard()
  startLuaCoroutine(self, "drawCardRevised")
end

function drawCardRevised()
  ::DrawStart::
  local starterDeck = GetDeckOrCard(starterDeckZone)

  if starterDeck != nil then
    if starterDeck.getQuantity() > 0 then
      if starterDeck != nil then
        starterDeck.deal(1, boardColor)
        starterDeck = GetDeckOrCard(starterDeckZone)
      end
    else
      if starterDeck != nil then
        starterDeck.deal(1, boardColor)
        --reshuffleDiscard()
      end
    end
  else
    reshuffleDiscard()

    local Time = os.clock() + 2.0
      while os.clock() < Time do
        coroutine.yield(0)
        end
      goto DrawStart
  end

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

function spendOneSpice()
  local items = getObjectFromGUID(playerBoard).getObjects()
  local check = 0

  for _, item in ipairs(items) do
    if item.getName() == "1 Spice" then
      getObjectFromGUID("9f81fa").putObject(item)
      check = 1
      break
    end
  end

  if check == 0 then
   for _, item in ipairs(items) do
    if item.getName() == "5 Spice" then
      getObjectFromGUID("9f81fa").putObject(item)

      params = {"", "Red"}
      getObjectFromGUID(spiceOneBag).call("makeSpiceStart", params)

      check = 1
      break
    end
   end
  end

  if check == 0 then
    if Player["Red"].seated then
    printToColor("No 1 Spice Available!", boardColor)
    end
  end
end

function spendFiveSpice()
  local items = getObjectFromGUID(playerBoard).getObjects()
  local check = 0

  for _, item in ipairs(items) do
    if item.getName() == "5 Spice" then
      getObjectFromGUID("9f81fa").putObject(item)
      check = 1
      break
    end
  end

  local fiveCount = 0

  for _, item in ipairs(items) do
    if item.getName() == "1 Spice" then
      fiveCount = fiveCount + 1
    end
  end

  if fiveCount > 4 and check == 0 then
    check = 1
    local countDown= 5
    for _, item in ipairs(items) do
      if item.getName() == "1 Spice" then
        getObjectFromGUID(spiceOneBag).putObject(item)
        countDown = countDown - 1
        if countDown == 0 then
          break
        end
      end
    end
  end

  if check == 0 then
    if Player["Red"].seated then
    printToColor("No 5 Spice Available!", boardColor)
    end
  end
end

function spendWater()
  local items = getObjectFromGUID(playerBoard).getObjects()
  local check = 0

  for _, item in ipairs(items) do
    if item.getName() == "Water" and item.tag == "Tile" then
      getObjectFromGUID(waterBag).putObject(item)
      check = 1
      break
    end
  end

  if check == 0 then
    if Player["Red"].seated then
    printToColor("No Water Available!", boardColor)
    end
  end

end

function spendOneSolaris()
  local items = getObjectFromGUID(playerBoard).getObjects()
  local check = 0

  for _, item in ipairs(items) do
    if item.getName() == "1 Solaris" then
      getObjectFromGUID(solarisOneBag).putObject(item)
      check = 1
      break
    end
  end

  if check == 0 then
   for _, item in ipairs(items) do
    if item.getName() == "5 Solaris" then
      getObjectFromGUID(solarisFiveBag).putObject(item)

      params = {"", "Red"}
      getObjectFromGUID(solarisOneBag).call("makeSolarisStart", params)

      check = 1
      break
    end
   end
  end

  if check == 0 then
    if Player["Red"].seated then
    printToColor("No 1 Solaris Available!", boardColor)
    end
  end
end

function spendFiveSolaris()
  local items = getObjectFromGUID(playerBoard).getObjects()
  local check = 0

  for _, item in ipairs(items) do
    if item.getName() == "5 Solaris" then
      getObjectFromGUID(solarisFiveBag).putObject(item)
      check = 1
      break
    end
  end

  local fiveCount = 0

  for _, item in ipairs(items) do
    if item.getName() == "1 Solaris" then
      fiveCount = fiveCount + 1
    end
  end

  if fiveCount > 4 and check == 0 then
    check = 1
    local countDown= 5
    for _, item in ipairs(items) do
      if item.getName() == "1 Solaris" then
        getObjectFromGUID(solarisOneBag).putObject(item)
        countDown = countDown - 1
        if countDown == 0 then
          break
        end
      end
    end
  end

  if check == 0 then
    if Player["Red"].seated then
    printToColor("No 5 Solaris Available!", boardColor)
    end
  end
end

function addGarrison()
  math.randomseed(os.time())
  local items = getObjectFromGUID(supplyZone).getObjects()
  for _, item in ipairs(items) do
    if item.getName() == "Red" and item.tag == "Block" then
      item.setPositionSmooth({(math.random() + math.random(1,2) + 0.5),2, (-math.random() - 0.5)},false,true)
      item.setRotationSmooth({0,0,0})
      break
    end
  end
end

function addDreadnought()
  math.randomseed(os.time())
  local items = getObjectFromGUID(playerBoard).getObjects()
  for _, item in ipairs(items) do
    if item.getName() == "Red Dreadnought" then
      item.setPositionSmooth({(math.random() + math.random(1,2) + 0.5),2, (-math.random() - 0.5)},false,true)
      item.setRotationSmooth({0,180,0})
      break
    end
  end
end

function addDreadConflict()
  local dreadCheck = 0
  math.randomseed(os.time())
  local items = getObjectFromGUID(garrisonZone).getObjects()
  for _, item in ipairs(items) do
    if item.getName() == "Red Dreadnought" then
      item.setPositionSmooth({(math.random(4,5) + 0.4),2, (-math.random() - 0.7)},false,true)
      item.setRotationSmooth({0,180,0})
      dreadCheck = 1
      break
    end
  end
  if dreadCheck == 0 then
    return 0
  else
    return 1
  end
end

function addConflict()
  math.randomseed(os.time())
  local items = getObjectFromGUID(garrisonZone).getObjects()
  for _, item in ipairs(items) do
    if item.getName() == "Red" and item.tag == "Block" then
      item.setPositionSmooth({(math.random(4,5) + 0.4),2, (-math.random() - 0.7)},false,true)
      item.setRotationSmooth({0,0,0})
      break
    end
  end
end

function sendNegotiator()
  math.randomseed(os.time())
  local items = getObjectFromGUID(supplyZone).getObjects()
  for _, item in ipairs(items) do
    if item.getName() == "Red" and item.tag == "Block" then
      item.setPositionSmooth({(math.random(16,17) + 0.45), 2, (math.random(7,9) + 0.25)},false,true)
      item.setRotationSmooth({0,0,0})
      broadcastToAll("Red Player sent a Negotiator to IX", stringColorToRGB("Red"))
      break
    end
  end
end

function sendSpecimen()
  math.randomseed(os.time())
  local adjustValueX = ((math.random(1,6)) / 10)
  local adjustValueZ = ((math.random(1,6)) / 10)
  local items = getObjectFromGUID(supplyZone).getObjects()
  for _, item in ipairs(items) do
    if item.getName() == "Red" and item.tag == "Block" then
      item.setPositionSmooth({(math.random(2,4) + adjustValueX), 13, (math.random(21,22) + adjustValueZ)},false,true)
      item.setRotationSmooth({0,0,0})
      broadcastToAll("Red Player sent a Specimen to the Axolotl Tanks", stringColorToRGB("Red"))
      break
    end
  end
end

function rivalSetup()
  buttons = {}
  buttonIndex = ""

  buttons = self.getButtons()
  if buttons != nil then
    for i, v in pairs(buttons) do
      if v.label == "Draw 5 Cards" then
        buttonIndex = i-1
      end
    end
  end
  self.removeButton(buttonIndex)

  buttons = self.getButtons()
  if buttons != nil then
    for i, v in pairs(buttons) do
      if v.label == "Draw 1 Card" then
        buttonIndex = i-1
      end
    end
  end
  self.removeButton(buttonIndex)

  buttons = self.getButtons()
  if buttons != nil then
    for i, v in pairs(buttons) do
      if v.label == "Reshuffle Discard" then
        buttonIndex = i-1
      end
    end
  end
  self.removeButton(buttonIndex)

  buttons = self.getButtons()
  if buttons != nil then
    for i, v in pairs(buttons) do
      if v.label == "Discard Revealed Cards" then
        buttonIndexFour = i-1
      end
    end
  end
  self.removeButton(buttonIndexFour)
end

function rivalButtons()
  buttonRed = 255
  buttonGreen = 084
  buttonBlue = 0

  buttonRed = buttonRed/255
  buttonGreen = buttonGreen/255
  buttonBlue = buttonBlue/255

  self.createButton ({
    ['click_function'] = 'takeOneSpice',
    ['label'] = 'Take 1 Spice',
    ['function_owner'] = self,
    ['position'] = {2.75, 0.9, 6},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 1200,
    ['height'] = 250,
    ['font_size'] = 100,
    ['color'] = {buttonRed, buttonGreen, buttonBlue},
    ['font_color'] = "White"
  })

  buttonRed = 0
  buttonGreen = 153
  buttonBlue = 255

  buttonRed = buttonRed/255
  buttonGreen = buttonGreen/255
  buttonBlue = buttonBlue/255

  self.createButton ({
    ['click_function'] = 'takeWater',
    ['label'] = 'Take 1 Water',
    ['function_owner'] = self,
    ['position'] = {-0.65, 0.9, 6},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 1200,
    ['height'] = 250,
    ['font_size'] = 100,
    ['color'] = {buttonRed, buttonGreen, buttonBlue},
    ['font_color'] = "White"
  })

  buttonRed = 128
  buttonGreen = 128
  buttonBlue = 128

  buttonRed = buttonRed/255
  buttonGreen = buttonGreen/255
  buttonBlue = buttonBlue/255

  self.createButton ({
    ['click_function'] = 'takeOneSolaris',
    ['label'] = 'Take 1 Solaris',
    ['function_owner'] = self,
    ['position'] = {-4, 0.9, 6},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 1200,
    ['height'] = 250,
    ['font_size'] = 100,
    ['color'] = {buttonRed, buttonGreen, buttonBlue},
    ['font_color'] = "White"
  })
  self.createButton ({
    ['click_function'] = 'drawIntrigue',
    ['label'] = 'Draw 1 Intrigue Card',
    ['function_owner'] = self,
    ['position'] = {-5.58, 0.9, -3.0},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 1200,
    ['height'] = 250,
    ['font_size'] = 100,
    ['color'] = {0,0,0},
    ['font_color'] = "Yellow"
  })
end


function takeOneSpice()
  getObjectFromGUID(spiceOneBag).takeObject({position = spiceBowl, rotation = {0,180,0}})
end


function takeWater()
  getObjectFromGUID(waterBag).takeObject({position = waterBowl, rotation = {0,180,0}})
end


function takeOneSolaris()
  getObjectFromGUID(solarisOneBag).takeObject({position = solarisBowl, rotation = {0,180,0}})
end

function drawIntrigue()
  local intrigueDeck = GetDeckOrCard(intrigueZone)
  local deckPos = getObjectFromGUID(drawDeckZone).getPosition()
  deckPos.y = 2
  if intrigueDeck.name == "Deck" or intrigueDeck.name == "DeckCustom" then
    local cardPull = intrigueDeck.takeObject({position = deckPos, flip = false})
  elseif intrigueDeck.name == "Card" or intrigueDeck.name == "CardCustom" then
    cardPull = intrigueDeck
    local cardPull = intrigueDeck.takeObject({position = deckPos, flip = false})
  end
end

function discardIntrigue()
  playerHand = Player["Red"].getHandObjects()
  for _, obj in ipairs(playerHand) do
    local scale = obj.getScale()
    if round(scale.x,2) == 0.88 and round(scale.z,2) == 0.88 then
      if obj.getDescription() == "Intrigue" then
        obj.setPosition({-18.00, 2.00, 17.81})
        obj.setRotation({0.00, 180.00, 180.00})
        break
      end
    end
  end
end

function discardIntrigueRival()
  local intriguePile = GetDeckOrCard("97ba78")
  if intriguePile != nil then
    if intriguePile.name == "Card" or intriguePile.name == "CardCustom" then
      intriguePile.setPositionSmooth({-18.00, 2.00, 17.81}, false, true)
      intriguePile.setRotation({0.00, 180.00, 180.00})
    elseif intriguePile.name == "Deck" or intriguePile.name == "DeckCustom" then
      local objPull = intriguePile.takeObject()
      objPull.setPositionSmooth({-18.00, 2.00, 17.81}, false, true)
      objPull.setRotation({0.00, 180.00, 180.00})
    end
  end
end

function onObjectEnterScriptingZone(zone,obj)
  if zone.getGUID() == drawDeckZone and Global.getVar("rivals")[1] == 1 then
   if obj.name == "Card" or obj.name == "CardCustom" then
    local vpCheck = 0
    local scaleCheck = obj.getScale()
    if round(scaleCheck.x,2) == 0.88 then
     Wait.frames(function()
      local deckCheck = GetDeckOrCard(drawDeckZone)
      if deckCheck != nil then
        if vpCheck == 0 and deckCheck.name == "Deck" or deckCheck.name == "DeckCustom" then
          if deckCheck.getQuantity() == 3 then
            vpCheck = 1
            deckCheck.setPositionSmooth({-18.00, 3.00, 17.81}, false, true)
            getObjectFromGUID("2da390").call("upRed",{})
          end
        end
      end
     end,60)
    end
   end
  end
end

function discardReveals()
  local discardRevealPos = getObjectFromGUID(discardZone).getPosition()
  local revealCards = getObjectFromGUID(revealButton).getVar("revealedCards")
  local revealAreaItems = getObjectFromGUID(revealArea).getObjects()

  discardRevealPos.y = 2

  for _, cardR in ipairs(revealCards) do
    if getObjectFromGUID(cardR) then
      getObjectFromGUID(cardR).setPositionSmooth(discardRevealPos,false,true)
    end
  end

  getObjectFromGUID(revealButton).call("resetReveal",{})

  for _, itemR in ipairs (revealAreaItems) do
    if itemR.tag == "Card" or itemR.tag == "CardCustom" or itemR.tag == "Deck" or itemR.tag == "DeckCustom" then
      itemR.setPositionSmooth(discardRevealPos,false,true)
    end
  end
end

function round(num, dec)
  local mult = 10^(dec or 0)
  return math.floor(num * mult + 0.5) / mult
end

-- ===== Solaris 85ebad (3814 chars) =====
--Counting Bowl    by MrStump
timerID = ""

validCountItemList = {
    ["5 Solaris"] = 5,
    ["1 Solaris"] = 1,
}

soloGame = 0
vpCheck = 0

function onLoad(saved_game_data)
    if saved_game_data ~= "" and saved_game_data ~= nil then
      local loaded_data = JSON.decode(saved_game_data)
      soloGame = loaded_data[1]
      vpCheck = loaded_data[2]
    else
      soloGame = 0
      vpCheck = 0
    end

    timerID = self.getGUID()..math.random(9999999999999)

    self.createButton({
        label="", click_function="none", function_owner=self,
        position={0,1.4,-1.5}, rotation={0,180,0}, height=00, width=0,
        font_color={1,1,1}, font_size=250
    })

    Timer.create({
        identifier=timerID,
        function_name="countItems", function_owner=self,
        repetitions=0, delay=0.75
    })
end

function onSave()
  local sg = soloGame
  local vpc = vpCheck

  local data_to_save = {sg,vpc}

  saved_game_data = JSON.encode(data_to_save)

  return saved_game_data
end

--Activated once per second, counts items in bowls
function countItems()
    local totalValue = 0
    local itemsInBowl = findItemsInSphere()
    --Go through all items found by the cast
    for _, entry in ipairs(itemsInBowl) do
        --Ignore the bowl
        if entry.hit_object ~= self then
            local tableEntry = validCountItemList[entry.hit_object.getName()]
            --Ignore if not in validCountItemList
            if tableEntry ~= nil then
                local descValue = tonumber(entry.hit_object.getDescription())
                local stackMult = math.abs(entry.hit_object.getQuantity())
                --Use value in description if available
                if descValue ~= nil then
                    totalValue = totalValue + descValue * stackMult
                else
                    --Otherwise use the value in validCountItemList
                    totalValue = totalValue + tableEntry * stackMult
                end
            end
        end
    end
    --Updates the number display
    spendCheck = totalValue
    totalValue = (totalValue .. " Solaris")

    UI.setValue("SOLARISred", totalValue)

    self.editButton({index=0, label=totalValue})
    if spendCheck >= 7 and vpCheck == 0 and soloGame == 1 then
      startLuaCoroutine(self, "spendResources")
      getObjectFromGUID("2da390").call("upRed",{})
    end
end

--Gets the items in the bowl for countItems to count
function findItemsInSphere()
    --Find scaling factor
    local scale = self.getScale()
    --Set position for the sphere
    local pos = self.getPosition()
    pos.y=pos.y+(1.25*scale.y)
    --Ray trace to get all objects
    return Physics.cast({
        origin=pos, direction={0,1,0}, type=2, max_distance=0,
        size={3.4*scale.x,3.4*scale.y,3.4*scale.z}, --debug=true
    })
end

function onDestroy()
  --if timerID ~= nil then
    --Timer.destroy(timerID)
  --end
end

function spendResources()
  local playerBoard = "bd39f6"
  local itemCount = 7

  if soloGame == 1 then
    local rivalItems = getObjectFromGUID(playerBoard).getObjects()

    for _, item in ipairs(rivalItems) do
      if item.getName() == "5 Solaris" and itemCount > 4 then

        local Time = os.clock() + 0.2
        while os.clock() < Time do
          coroutine.yield(0)
        end

        getObjectFromGUID("9f81fa").putObject(item)
        itemCount = itemCount - 5
      elseif item.getName() == "1 Solaris" and itemCount > 0 then

        local Time = os.clock() + 0.2
        while os.clock() < Time do
          coroutine.yield(0)
        end

        getObjectFromGUID("9f81fa").putObject(item)
        itemCount = itemCount - 1
      end
    end
  end
  vpCheck = 0
  return 1
end

function setSolo()
  soloGame = 1
end

-- ===== Spice 8655b7 (5616 chars) =====
--Counting Bowl    by MrStump
timerID = ""

validCountItemList = {
    ["5 Spice"] = 5,
    ["1 Spice"] = 1,
}

soloGame = 0
vpCheck = 0
spiceCount = 0
firstPlayerToken = "784534"

function onLoad(saved_game_data)
    if saved_game_data ~= "" and saved_game_data ~= nil then
      local loaded_data = JSON.decode(saved_game_data)
      soloGame = loaded_data[1]
      vpCheck = loaded_data[2]
    else
      soloGame = 0
      vpCheck = 0
    end

    timerID = self.getGUID()..math.random(9999999999999)

    self.createButton({
        label="", click_function="none", function_owner=self,
        position={0,1.4,-1.5}, rotation={0,180,0}, height=00, width=0,
        font_color={1,1,1}, font_size=250
    })

    Timer.create({
        identifier=timerID,
        function_name="countItems", function_owner=self,
        repetitions=0, delay=0.75
    })
end

function onSave()
  local sg = soloGame
  local vpc = vpCheck

  local data_to_save = {sg,vpc}

  saved_game_data = JSON.encode(data_to_save)

  return saved_game_data
end

--Activated once per second, counts items in bowls
function countItems()
    local totalValue = 0
    local itemsInBowl = findItemsInSphere()
    --Go through all items found by the cast
    for _, entry in ipairs(itemsInBowl) do
        --Ignore the bowl
        if entry.hit_object ~= self then
            local tableEntry = validCountItemList[entry.hit_object.getName()]
            --Ignore if not in validCountItemList
            if tableEntry ~= nil then
                local descValue = tonumber(entry.hit_object.getDescription())
                local stackMult = math.abs(entry.hit_object.getQuantity())
                --Use value in description if available
                if descValue ~= nil then
                    totalValue = totalValue + descValue * stackMult
                else
                    --Otherwise use the value in validCountItemList
                    totalValue = totalValue + tableEntry * stackMult
                end
            end
        end
    end
    --Updates the number display
    spendCheck = totalValue
    spiceCount = totalValue
    totalValue = (totalValue .. " Spice")

    UI.setValue("SPICEred", totalValue)

    local intrigueCheck = GetDeckOrCard("97ba78")
    if intrigueCheck != nil and Global.getVar("inProgress") == 1 and Global.getVar("rivals")[1] == 1 then
      local intrigueCount = intrigueCheck.getQuantity()
      if intrigueCount == -1 then
        intrigueCount = 1
      end
      UI.setValue("INTRIGUEred", intrigueCount)
    elseif intrigueCheck == nil and Global.getVar("inProgress") == 1 and Global.getVar("rivals")[1] == 1 then
      intrigueCount = 0
      UI.setValue("INTRIGUEred", intrigueCount)
    elseif Global.getVar("inProgress") == 1 and Global.getVar("rivals")[1] != 1 then
      local handQuery = Player["Red"].getHandObjects(1)
      local intrigueCount = 0

      for _, cardItem in ipairs(handQuery) do
        if cardItem.getDescription() == "Intrigue" then
          intrigueCount = intrigueCount + 1
        end
      end
      UI.setValue("INTRIGUEred", intrigueCount)
    end

    self.editButton({index=0, label=totalValue})
    if spendCheck >= 7 and vpCheck == 0 and soloGame == 1 then
      vpCheck = 1
      startLuaCoroutine(self, "spendResources")
      --getObjectFromGUID("2da390").call("upRed",{})
    end
end

--Gets the items in the bowl for countItems to count
function findItemsInSphere()
    --Find scaling factor
    local scale = self.getScale()
    --Set position for the sphere
    local pos = self.getPosition()
    pos.y=pos.y+(1.25*scale.y)
    --Ray trace to get all objects
    return Physics.cast({
        origin=pos, direction={0,1,0}, type=2, max_distance=0,
        size={3.4*scale.x,3.4*scale.y,3.4*scale.z}, --debug=true
    })
end

function onDestroy()
  --if timerID ~= nil then
    --Timer.destroy(timerID)
  --end
end

function spendResources()
  local playerBoard = "bd39f6"
  local itemCount = 7
  local conflictCount = 0
  local ixCheck = 0

  for _, conflictObj in ipairs(getObjectFromGUID("4a21d4").getObjects()) do
    if conflictObj.tag == "Deck" or conflictObj.tag == "DeckCustom" then
      conflictCount = conflictObj.getQuantity()
    end
  end

  if conflictCount >= (7 - getObjectFromGUID(firstPlayerToken).getVar("epicMode")) and getObjectFromGUID(firstPlayerToken).getVar("riseIX") == 1 then
    ixCheck = 1
  end

  if soloGame == 1 and ixCheck == 1 then
    for i=1, itemCount do
      getObjectFromGUID("a0fa97").call("spendOneSpice", {})
      itemCount = itemCount - 1

      local Time = os.clock() + 0.5
      while os.clock() < Time do
        coroutine.yield(0)
      end
    end
    getObjectFromGUID("2da390").call("upRed",{})

  elseif soloGame == 1 and getObjectFromGUID(firstPlayerToken).getVar("riseIX") == 0 then
    for i=1, itemCount do
      getObjectFromGUID("a0fa97").call("spendOneSpice", {})
      itemCount = itemCount - 1

      local Time = os.clock() + 0.5
      while os.clock() < Time do
        coroutine.yield(0)
      end
    end
    getObjectFromGUID("2da390").call("upRed",{})

  end
  vpCheck = 0
  return 1
end

function setSolo()
  soloGame = 1
end

function GetDeckOrCard(zoneGUID)
  for _, obj in ipairs(getObjectFromGUID(zoneGUID).getObjects()) do
    if obj.name == "Card" or obj.name == "CardCustom" or obj.name == "Deck" or obj.name == "DeckCustom" then
      return obj
    end
  end

 return nil
end

-- ===== Water ff8960 (3537 chars) =====
--Counting Bowl    by MrStump
timerID = ""

validCountItemList = {
    ["Water"] = 1,
}

soloGame = 0
vpCheck = 0

function onLoad(saved_game_data)
    if saved_game_data ~= "" and saved_game_data ~= nil then
      local loaded_data = JSON.decode(saved_game_data)
      soloGame = loaded_data[1]
      vpCheck = loaded_data[2]
    else
      soloGame = 0
      vpCheck = 0
    end

    timerID = self.getGUID()..math.random(9999999999999)

    self.createButton({
        label="", click_function="none", function_owner=self,
        position={0,1.4,-1.5}, rotation={0,180,0}, height=00, width=0,
        font_color={1,1,1}, font_size=250
    })

    Timer.create({
        identifier=timerID,
        function_name="countItems", function_owner=self,
        repetitions=0, delay=0.75
    })
end

function onSave()
  local sg = soloGame
  local vpc = vpCheck

  local data_to_save = {sg,vpc}

  saved_game_data = JSON.encode(data_to_save)

  return saved_game_data
end

--Activated once per second, counts items in bowls
function countItems()
    local totalValue = 0
    local itemsInBowl = findItemsInSphere()
    --Go through all items found by the cast
    for _, entry in ipairs(itemsInBowl) do
        --Ignore the bowl
        if entry.hit_object ~= self then
            local tableEntry = validCountItemList[entry.hit_object.getName()]
            --Ignore if not in validCountItemList
            if tableEntry ~= nil then
                local descValue = tonumber(entry.hit_object.getDescription())
                local stackMult = math.abs(entry.hit_object.getQuantity())
                --Use value in description if available
                if descValue ~= nil then
                    totalValue = totalValue + descValue * stackMult
                else
                    --Otherwise use the value in validCountItemList
                    totalValue = totalValue + tableEntry * stackMult
                end
            end
        end
    end
    --Updates the number display
    spendCheck = totalValue
    totalValue = (totalValue .. " Water")

    UI.setValue("WATERred", totalValue)

    self.editButton({index=0, label=totalValue})
    if spendCheck >= 3 and vpCheck == 0 and soloGame == 1 then
      vpCheck = 1
      startLuaCoroutine(self, "spendResources")
      getObjectFromGUID("2da390").call("upRed",{})
    end
end

--Gets the items in the bowl for countItems to count
function findItemsInSphere()
    --Find scaling factor
    local scale = self.getScale()
    --Set position for the sphere
    local pos = self.getPosition()
    pos.y=pos.y+(1.25*scale.y)
    --Ray trace to get all objects
    return Physics.cast({
        origin=pos, direction={0,1,0}, type=2, max_distance=0,
        size={3.4*scale.x,3.4*scale.y,3.4*scale.z}, --debug=true
    })
end

function onDestroy()
  --if timerID ~= nil then
    --Timer.destroy(timerID)
  --end
end

function spendResources()
  local playerBoard = "bd39f6"
  local itemCount = 3

  if soloGame == 1 then
    local rivalItems = getObjectFromGUID(playerBoard).getObjects()

    for _, item in ipairs(rivalItems) do
      if item.getName() == "Water" and itemCount > 0 and item.getGUID() != self.getGUID() then
        local Time = os.clock() + 0.2
        while os.clock() < Time do
          coroutine.yield(0)
        end

        getObjectFromGUID("9f81fa").putObject(item)
        itemCount = itemCount - 1
      end
    end
  end
  vpCheck = 0
  return 1
end

function setSolo()
  soloGame = 1
end

-- ===== Troop Supply 10b4be (2423 chars) =====
--Counting Bowl    by MrStump
timerID = ""

validCountItemList = {
    ["Red"] = 1,
}

function onLoad()
    timerID = self.getGUID()..math.random(9999999999999)
    
    self.createButton({
        label="", click_function="none", function_owner=self,
        position={0,1.4,-1.8}, rotation={0,180,0}, height=00, width=0,
        font_color={1,1,1}, font_size=250
    })
    
    Timer.create({
        identifier=timerID,
        function_name="countItems", function_owner=self,
        repetitions=0, delay=0.75
    })
end

--Activated once per second, counts items in bowls
function countItems()
    local totalValue = 0
    local itemsInBowl = findItemsInSphere()
    --Go through all items found by the cast
    for _, entry in ipairs(itemsInBowl) do
        --Ignore the bowl
        if entry.hit_object ~= self then
            local tableEntry = validCountItemList[entry.hit_object.getName()]
            --Ignore if not in validCountItemList
            if tableEntry ~= nil then
                local descValue = tonumber(entry.hit_object.getDescription())
                local stackMult = math.abs(entry.hit_object.getQuantity())
                --Use value in description if available
                if descValue ~= nil then
                    totalValue = totalValue + descValue * stackMult
                else
                    --Otherwise use the value in validCountItemList
                    totalValue = totalValue + tableEntry * stackMult
                end
            end
        end
    end
    --Updates the number display
    if totalValue == 1 then 
      totalValue = (totalValue .. " Troop")
    elseif totalValue > 1 then
      totalValue = (totalValue .. " Troops")
    elseif totalValue == 0 then
      totalValue = ("0 Troops")
    end
    self.editButton({index=0, label=totalValue})
end

--Gets the items in the bowl for countItems to count
function findItemsInSphere()
    --Find scaling factor
    local scale = self.getScale()
    --Set position for the sphere
    local pos = self.getPosition()
    pos.y=pos.y+(1.25*scale.y)
    --Ray trace to get all objects
    return Physics.cast({
        origin=pos, direction={0,1,0}, type=2, max_distance=0,
        size={3.4*scale.x,3.4*scale.y,3.4*scale.z}, --debug=true
    })
end

function onDestroy()
  --if timerID ~= nil then
    --Timer.destroy(timerID)
  --end
end

-- ===== Count Richese 78551e (1910 chars) =====
function onLoad()
  if Vector.equals(self.getPosition(), Vector({-18.00, 1.08, 22.80}), 0.02) then
  self.createButton({
     click_function = "claimLeader",
     function_owner = self,
     label          = "Claim Leader",
     position       = {0,0.2,0.4},
     rotation       = {0, 0, 0},
     scale          = {0.5, 1, 0.5},
     width          = 700,
     height         = 150,
     tooltip        = "",
     font_color     = {1, 1, 1},
     font_size      = 85,
     color          = "Black"
     })
  end
end 
	 
function claimLabel()
  self.createButton({
     click_function = "claimLeader",
     function_owner = self,
     label          = "Claim Leader",
     position       = {0,0.2,0.4},
     rotation       = {0, 0, 0},
     scale          = {0.5, 1, 0.5},
     width          = 700,
     height         = 150,
     tooltip        = "",
     font_color     = {1, 1, 1},
     font_size      = 85,
     color          = "Black"
     })
end

function claimLeader(GO, color)
  if color == "Red" then
    leaderPos = {-40.00, 2, -12.89}
    leaderRot = {0.00, 180.00, 0.00}
    GO.setPositionSmooth(leaderPos)
    GO.setRotationSmooth(leaderRot)
    GO.clearButtons()
  elseif color == "Blue" then
    leaderPos = {-15.00, 2, -12.89}
    leaderRot = {0.00, 180.00, 0.00}
    GO.setPositionSmooth(leaderPos)
    GO.setRotationSmooth(leaderRot)
    GO.clearButtons()
  elseif color == "Orange" then
    leaderPos = {15.00, 2, -12.89}
    leaderRot = {0.00, 180.00, 0.00}
    GO.setPositionSmooth(leaderPos)
    GO.setRotationSmooth(leaderRot)
    GO.clearButtons()
  elseif color == "Green" then
    leaderPos = {40.00, 2, -12.89}
    leaderRot = {0.00, 180.00, 0.00}
    GO.setPositionSmooth(leaderPos)
    GO.setRotationSmooth(leaderRot)
    GO.clearButtons()
  else
    printToAll("Cannot Select Leader Until the Player is Seated!")
  end
end

-- ===== First Player Marker 784534 (20029 chars) =====
defaultColorList = {"Red", "Blue", "Orange", "Green"}
colorList = {}
mainBoard = "2da390"
playerPingCount = 0
currentPlayer = {0,0,0,0}
initialRival = {0,0,0,0}
playerSeated = {0,0,0,0}
savedRival = {0,0,0,0}
leaderZones = {"bd39f6", "9b4f33", "bd5bf6", "231215"}
inProgress = 0
riseIX = 0
immortality = 0
epicMode = 0
elevenMode = 0

addIxState = 0
addImmortalityState = 0

function onSave()
  ip = inProgress
  cl = colorList
  cp = currentPlayer
  ir = initialRival
  sr = savedRival
  ps = playerSeated
  ix = riseIX
  im = immortality
  em = epicMode
  vm = elevenMode

  local data_to_save = {ip, cl, cp, ir, sr, ps, ix, im, em, vm}

  saved_data_player = JSON.encode(data_to_save)
  return saved_data_player
end

function onLoad(saved_data_player)
  if saved_data_player ~= "" and saved_data_player ~= nil then
    local loaded_data = JSON.decode(saved_data_player)
    inProgress = loaded_data[1]
    colorList = loaded_data[2]
    currentPlayer = loaded_data[3]
    initialRival = loaded_data[4]
    savedRival = loaded_data[5]
    playerSeated = loaded_data[6]
    riseIX = loaded_data[7]
    immortality = loaded_data[8]
    epicMode = loaded_data[9]
    elevenMode = loaded_data[10]
    if inProgress == nil then
      inProgress = 0
    end
    if colorList == nil then
      colorList = {}
    end
    if currentPlayer == nil then
      currentPlayer = {0,0,0,0}
    end
    if initialRival == nil then
      initialRival = {0,0,0,0}
    end
    if savedRival == nil then
      savedRival = {0,0,0,0}
    end
    if playerSeated == nil then
      playerSeated = {0,0,0,0}
    end
    if riseIX == nil then
      riseIX = 0
    end
    if immortality == nil then
      immortality = 0
    end
    if epicMode == nil then
      epicMode = 0
    end
    if elevenMode == nil then
      elevenMode = 0
    end
  else
    inProgress = 0
    colorList = {}
    currentPlayer = {0,0,0,0}
    initialRival = {0,0,0,0}
    savedRival = {0,0,0,0}
    playerSeated = {0,0,0,0}
    riseIX = 0
    immortality = 0
    epicMode = 0
    elevenMode = 0
  end

  buttonRed = 195
  buttonGreen = 64
  buttonBlue = 1

  buttonRed = buttonRed/255
  buttonGreen = buttonGreen/255
  buttonBlue = buttonBlue/255

  self.clearButtons()
  if inProgress == 0 then
  self.createButton ({
    ['click_function'] = 'setupGameStart',
    ['label'] = 'Setup Game',
    ['function_owner'] = self,
    ['position'] = {0.00, 0.7, 0.0},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 4000,
    ['height'] = 500,
    ['font_size'] = 350,
    ['color'] = {buttonRed, buttonGreen, buttonBlue},
    ['font_color'] = "White"
  })
  self.createButton ({
    ['click_function'] = 'doNothing',
    ['label'] = 'Rise of IX Expansion Not Included',
    ['function_owner'] = self,
    ['position'] = {0.00, 0.7, 1.0},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 0,
    ['height'] = 300,
    ['font_size'] = 175,
    ['color'] = {0,0,0},
    ['font_color'] = "White"
  })
  self.createButton ({
    ['click_function'] = 'doNothing',
    ['label'] = '[add the Rise of IX expansion prior to setup]',
    ['function_owner'] = self,
    ['position'] = {0.00, 0.7, 1.6},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 0,
    ['height'] = 300,
    ['font_size'] = 125,
    ['color'] = {0,0,0},
    ['font_color'] = "White"
  })
  self.createButton ({
    ['click_function'] = 'doNothing',
    ['label'] = 'Immortality Expansion Not Included',
    ['function_owner'] = self,
    ['position'] = {0.00, 0.7, -1.0},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 0,
    ['height'] = 300,
    ['font_size'] = 175,
    ['color'] = {0,0,0},
    ['font_color'] = "White"
  })
  self.createButton ({
    ['click_function'] = 'doNothing',
    ['label'] = '[add the Immortality expansion prior to setup]',
    ['function_owner'] = self,
    ['position'] = {0.00, 0.7, -1.6},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 0,
    ['height'] = 300,
    ['font_size'] = 125,
    ['color'] = {0,0,0},
    ['font_color'] = "White"
  })
  end
end

function doNothing()
end

function expansionImmortalityStart()
  addImmortalityState = 1
  --print("Immortality Start")
  --print(addImmortalityState)
end

function expansionImmortalityAdded()
  addImmortalityState = 0
  --print("Immortality Added")
  --print(addImmortalityState)
end

function expansionIxStart()
  addIxState = 1
  --print("IX Start")
  --print(addIxState)
end

function expansionIxAdded()
  addIxState = 0
  --print("IX Added")
  --print(addIxState)
end

function displayEpic()
  --buttonRed = 195
  --buttonGreen = 64
  --buttonBlue = 1

  buttonRed = 20
  buttonGreen = 31
  buttonBlue = 27

  buttonRed = buttonRed/255
  buttonGreen = buttonGreen/255
  buttonBlue = buttonBlue/255

  self.createButton ({
    ['click_function'] = 'enableEpic',
    ['label'] = '[ ] Epic Game Mode Disabled',
    ['function_owner'] = self,
    ['position'] = {0.00, 0.7, 1.8},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 2000,
    ['height'] = 300,
    ['font_size'] = 125,
    ['color'] = {buttonRed, buttonGreen, buttonBlue},
    ['font_color'] = "White"
  })
end

function displayEleven()
  buttonRed = 80
  buttonGreen = 20
  buttonBlue = 115

  buttonRed = buttonRed/255
  buttonGreen = buttonGreen/255
  buttonBlue = buttonBlue/255

  self.createButton ({
    ['click_function'] = 'enableEleven',
    ['label'] = '[ ] Go to 11 Game Mode Disabled',
    ['function_owner'] = self,
    ['position'] = {0.00, 0.7, -1.8},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 2000,
    ['height'] = 300,
    ['font_size'] = 125,
    ['color'] = {buttonRed, buttonGreen, buttonBlue},
    ['font_color'] = "White"
  })
end

function saveRival(selected)
  for i=1, 4 do
    if selected[1] == i then
      savedRival[i] = 1
    end
  end
end

function updateCurrent(selected)
  for i=1, 4 do
    if selected[1] == i then
      currentPlayer[5-i] = 1
      initialRival[i] = 1
      params = {i}
      getObjectFromGUID("f1a7d1").call("rivalButtonUpdate", {params})
    end
  end
end

function setupGameStart()
  playerPingCount = 0
  playerCheck = Player.getPlayers()

  for _, playerPing in ipairs(playerCheck) do
    if playerPing.color == "Red" or playerPing.color == "Blue" or playerPing.color == "Orange" or playerPing.color == "Green" then
      playerPingCount = playerPingCount + 1
    end
  end

  if riseIX == 0 then
    getObjectFromGUID("dee0f6").clearButtons()
  end

  if playerPingCount > 0 then
    local leaderCheck = 0
    for i=1,4 do
      if Player[defaultColorList[i]].seated then
        areaCheck = getObjectFromGUID(leaderZones[i]).getObjects()
        for _, item in ipairs(areaCheck) do
          if item.getDescription() == "Leader" then
            leaderCheck = 1
            break
          end
          leaderCheck = 0
        end
      end
    end

   if leaderCheck == 1 then

    self.setLock(false)
    self.clearButtons()
    startLuaCoroutine(self, "setupGame")

    Wait.frames(function()
      RandomFP()
      getObjectFromGUID(mainBoard).call("conflictZoneSetup", {})
    end, 400)
   else
     broadcastToAll("All Players Select a Leader!")
   end
  else
    broadcastToAll("No Players Seated!")
    resetSetup()
  end
end

function setupGame()
  inProgress = 1

  --Rise of IX Setup Button
  if getObjectFromGUID("7a5cb7") then
    destroyObject(getObjectFromGUID("7a5cb7"))
  end

  --Immortality Setup Button
  if getObjectFromGUID("9eb966") then
    destroyObject(getObjectFromGUID("9eb966"))
  end

  Global.call("setupGameStart",{})

  return 1
end

function resetSetup()

  buttonRed = 195
  buttonGreen = 64
  buttonBlue = 1

  buttonRed = buttonRed/255
  buttonGreen = buttonGreen/255
  buttonBlue = buttonBlue/255

  self.clearButtons()
  self.createButton ({
    ['click_function'] = 'setupGameStart',
    ['label'] = 'Setup Game',
    ['function_owner'] = self,
    ['position'] = {0.00, 0.7, 0.0},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 4000,
    ['height'] = 500,
    ['font_size'] = 350,
    ['color'] = {buttonRed, buttonGreen, buttonBlue},
    ['font_color'] = "White"
  })

  self.createButton ({
    ['click_function'] = 'doNothing',
    ['label'] = 'Rise of IX Expansion Not Included',
    ['function_owner'] = self,
    ['position'] = {0.00, 0.7, 1.0},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 0,
    ['height'] = 300,
    ['font_size'] = 175,
    ['color'] = {0,0,0},
    ['font_color'] = "White"
  })
  self.createButton ({
    ['click_function'] = 'doNothing',
    ['label'] = '[add the Rise of IX expansion prior to setup]',
    ['function_owner'] = self,
    ['position'] = {0.00, 0.7, 1.6},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 0,
    ['height'] = 300,
    ['font_size'] = 125,
    ['color'] = {0,0,0},
    ['font_color'] = "White"
  })
  self.createButton ({
    ['click_function'] = 'doNothing',
    ['label'] = 'Immortality Expansion Not Included',
    ['function_owner'] = self,
    ['position'] = {0.00, 0.7, -1.0},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 0,
    ['height'] = 300,
    ['font_size'] = 175,
    ['color'] = {0,0,0},
    ['font_color'] = "White"
  })
  self.createButton ({
    ['click_function'] = 'doNothing',
    ['label'] = '[add the Immortality expansion prior to setup]',
    ['function_owner'] = self,
    ['position'] = {0.00, 0.7, -1.6},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 0,
    ['height'] = 300,
    ['font_size'] = 125,
    ['color'] = {0,0,0},
    ['font_color'] = "White"
  })
end

function enableEpic()
  if epicMode == 0 then
    epicMode = 1
    buttons = self.getButtons()
    if buttons != nil then
      for i, v in pairs(buttons) do
        if v.label == "[ ] Epic Game Mode Disabled" then
          buttonIndex = i-1
        end
      end
    end
    self.editButton({index=buttonIndex, label="[x] Epic Game Mode Enabled!"})
  elseif epicMode == 1 then
    epicMode = 0
    buttons = self.getButtons()
    if buttons != nil then
      for i, v in pairs(buttons) do
        if v.label == "[x] Epic Game Mode Enabled!" then
          buttonIndex = i-1
        end
      end
    end
    self.editButton({index=buttonIndex, label="[ ] Epic Game Mode Disabled"})
  end
end

function enableEleven()
  if elevenMode == 0 then
    elevenMode = 1
    buttons = self.getButtons()
    if buttons != nil then
      for i, v in pairs(buttons) do
        if v.label == "[ ] Go to 11 Game Mode Disabled" then
          buttonIndex = i-1
        end
      end
    end
    self.editButton({index=buttonIndex, label="[x] Go to 11 Game Mode Enabled!"})
  elseif elevenMode == 1 then
    elevenMode = 0
    buttons = self.getButtons()
    if buttons != nil then
      for i, v in pairs(buttons) do
        if v.label == "[x] Go to 11 Game Mode Enabled!" then
          buttonIndex = i-1
        end
      end
    end
    self.editButton({index=buttonIndex, label="[ ] Go to 11 Game Mode Disabled"})
  end
end

function expansionIX()
  if riseIX == 0 then
    riseIX = 1
    buttons = self.getButtons()
    if buttons != nil then
      for i, v in pairs(buttons) do
        if v.label == "Rise of IX Expansion Not Included" then
          buttonIndex = i-1
        end
      end
    end
    self.editButton({index=buttonIndex, label="Rise of IX Expansion Included!"})
  elseif riseIX == 1 then
    riseIX = 0
    buttons = self.getButtons()
    if buttons != nil then
      for i, v in pairs(buttons) do
        if v.label == "Rise of IX Expansion Included!" then
          buttonIndex = i-1
        end
      end
    end
    self.editButton({index=buttonIndex, label="Rise of IX Expansion Not Included"})
  end

  buttons = self.getButtons()
  if buttons != nil then
    for i, v in pairs(buttons) do
      if v.label == "[add the Rise of IX expansion prior to setup]" then
        buttonIndex = i-1
      end
    end
  end
  self.removeButton(buttonIndex)
end

function expansionImmortality()
  if immortality == 0 then
    immortality = 1
    buttons = self.getButtons()
    if buttons != nil then
      for i, v in pairs(buttons) do
        if v.label == "Immortality Expansion Not Included" then
          buttonIndex = i-1
        end
      end
    end
    self.editButton({index=buttonIndex, label="Immortality Expansion Included!"})
  elseif riseIX == 1 then
    riseIX = 0
    buttons = self.getButtons()
    if buttons != nil then
      for i, v in pairs(buttons) do
        if v.label == "Immortality Expansion Included!" then
          buttonIndex = i-1
        end
      end
    end
    self.editButton({index=buttonIndex, label="Immortality Expansion Not Included"})
  end

  buttons = self.getButtons()
  if buttons != nil then
    for i, v in pairs(buttons) do
      if v.label == "[add the Immortality expansion prior to setup]" then
        buttonIndex = i-1
      end
    end
  end
  self.removeButton(buttonIndex)
end

function RandomFP()
  buttonRed = 195
  buttonGreen = 64
  buttonBlue = 1

  buttonRed = buttonRed/255
  buttonGreen = buttonGreen/255
  buttonBlue = buttonBlue/255

  if playerPingCount != 1 then

   math.randomseed(os.time())
   PopulateColorList()

   if #colorList > 0 then
    local r = math.random(#colorList)
    broadcastToAll("-- First Player: ".. colorList[r] .." --", stringColorToRGB(colorList[r]))

    checkColor = colorList[r]

    if checkColor == "Red" then
      self.setPositionSmooth({-40, 4, -7.00})
      self.setRotationSmooth({0.00, 180.00, 0.00})
      currentPlayer[4] = 1
    elseif checkColor == "Blue" then
      self.setPositionSmooth({-15.00, 4, -7.00})
      self.setRotationSmooth({0.00, 180.00, 0.00})
      currentPlayer[3] = 1
    elseif checkColor == "Orange" then
      self.setPositionSmooth({15.00, 4, -7.00})
      self.setRotationSmooth({0.00, 180.00, 0.00})
      currentPlayer[2] = 1
    elseif checkColor == "Green" then
      self.setPositionSmooth({40, 4, -7.00})
      self.setRotationSmooth({0.00, 180.00, 0.00})
      currentPlayer[1] = 1
    end

    --Wait.frames(function()
      --self.setLock(true)
    --end, 120)

   end
  end
end

function createPlayerPass()
  playerCheck = Player.getPlayers()

  for _, playerPing in ipairs(playerCheck) do
    if playerPing.color == "Red" or playerPing.color == "Blue" or playerPing.color == "Orange" or playerPing.color == "Green" then
      playerPingCount = playerPingCount + 1
    end
  end

  if playerPingCount > 2 then
   self.clearButtons()
   self.createButton ({
    ['click_function'] = 'passPlayer',
    ['label'] = 'Pass First Player',
    ['function_owner'] = self,
    ['position'] = {0.0, 0.3, 0.9},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 1000,
    ['height'] = 300,
    ['font_size'] = 125,
    ['color'] = {buttonRed, buttonGreen, buttonBlue},
    ['font_color'] = "White"
   })
  end
end

function PopulateColorList()
  for _, color in ipairs(defaultColorList) do
    for _, dcolor in ipairs(getSeatedPlayers()) do
      if dcolor == color then
        table.insert(colorList, color)
      end
    end
  end
end

--function passPlayer(GO, colorCall)
function passPlayer()
  playerPingCount = 0
  playerCheck = Player.getPlayers()

  for _, playerPing in ipairs(playerCheck) do
    if playerPing.color == "Red" or playerPing.color == "Blue" or playerPing.color == "Orange" or playerPing.color == "Green" then
      playerPingCount = playerPingCount + 1
    end
  end

  local nextPlayer = 0
  local rivalCheck = Global.getVar("rivals")

  playerSeated = {0,0,0,0}

  if Player["Red"].seated or rivalCheck[1] == 1 then
    playerSeated[1] = 1
  end

  if Player["Blue"].seated or rivalCheck[2] == 1 then
    playerSeated[2] = 1
  end

  if Player["Orange"].seated or rivalCheck[3] == 1 then
    playerSeated[3] = 1
  end

  if Player["Green"].seated or rivalCheck[4] == 1 then
    playerSeated[4] = 1
  end

  if playerPingCount != 2 then

  if currentPlayer[1] == 1 then
    if playerSeated[3] == 1 then
      nextPlayer = 3
    elseif playerSeated[2] == 1 then
      nextPlayer = 2
    elseif playerSeated[1] == 1 then
      nextPlayer = 1
    end
  end
  if currentPlayer[2] == 1 then
    if playerSeated[2] == 1 then
      nextPlayer = 2
    elseif playerSeated[1] == 1 then
      nextPlayer = 1
    elseif playerSeated[4] == 1 then
      nextPlayer = 4
    end
  end
  if currentPlayer[3] == 1 then
    if playerSeated[1] == 1 then
      nextPlayer = 1
    elseif playerSeated[4] == 1then
      nextPlayer = 4
    elseif playerSeated[3] == 1 then
      nextPlayer = 3
    end
  end
  if currentPlayer[4] == 1 then
    if playerSeated[4] == 1 then
      nextPlayer = 4
    elseif playerSeated[3] == 1 then
      nextPlayer = 3
    elseif playerSeated[2] == 1 then
      nextPlayer = 2
    end
  end

  elseif playerPingCount == 2 then

    if currentPlayer[1] == 1 then
      if playerSeated[3] == 1 and rivalCheck[3] != 1 then
        nextPlayer = 3
      elseif playerSeated[2] == 1 and rivalCheck[2] != 1 then
        nextPlayer = 2
      elseif playerSeated[1] == 1 and rivalCheck[1] != 1 then
        nextPlayer = 1
      end
    end
    if currentPlayer[2] == 1 then
      if playerSeated[2] == 1 and rivalCheck[2] != 1 then
        nextPlayer = 2
      elseif playerSeated[1] == 1 and rivalCheck[1] != 1 then
        nextPlayer = 1
      elseif playerSeated[4] == 1 and rivalCheck[4] != 1 then
        nextPlayer = 4
      end
    end
    if currentPlayer[3] == 1 then
      if playerSeated[1] == 1 and rivalCheck[1] != 1 then
        nextPlayer = 1
      elseif playerSeated[4] == 1 and rivalCheck[4] != 1 then
        nextPlayer = 4
      elseif playerSeated[3] == 1 and rivalCheck[3] != 1 then
        nextPlayer = 3
      end
    end
    if currentPlayer[4] == 1 then
      if playerSeated[4] == 1 and rivalCheck[4] != 1 then
        nextPlayer = 4
      elseif playerSeated[3] == 1 and rivalCheck[3] != 1 then
        nextPlayer = 3
      elseif playerSeated[2] == 1 and rivalCheck[2] != 1 then
        nextPlayer = 2
      end
    end

  end

  currentPlayer = {0,0,0,0}
  for i=1, 4 do
    if i == nextPlayer then
      currentPlayer[5-i] = 1
      initialRival[i] = 1
    end
  end

  if nextPlayer == 4 then
    self.setPositionSmooth({40.00, 4, -7.00})
    self.setRotationSmooth({0.00, 180.00, 0.00})
    params = {4}
    if playerPingCount == 1 then
      getObjectFromGUID("f1a7d1").call("setRival",params)
    end
    broadcastToAll("-- First Player Now: Green --", stringColorToRGB("Green"))
  elseif nextPlayer == 1 then
    self.setPositionSmooth({-40.00, 4, -7.00})
    self.setRotationSmooth({0.00, 180.00, 0.00})
    params = {1}
    if playerPingCount == 1 then
      getObjectFromGUID("f1a7d1").call("setRival",params)
    end
    broadcastToAll("-- First Player Now: Red --", stringColorToRGB("Red"))
  elseif nextPlayer == 2 then
    self.setPositionSmooth({-15.00, 4, -7.00})
    self.setRotationSmooth({0.00, 180.00, 0.00})
    params = {2}
    if playerPingCount == 1 then
      getObjectFromGUID("f1a7d1").call("setRival",params)
    end
    broadcastToAll("-- First Player Now: Blue --", stringColorToRGB("Blue"))
  elseif nextPlayer == 3 then
    self.setPositionSmooth({15.00, 4, -7.00})
    self.setRotationSmooth({0.00, 180.00, 0.00})
    params = {3}
    if playerPingCount == 1 then
      getObjectFromGUID("f1a7d1").call("setRival",params)
    end
    broadcastToAll("-- First Player Now: Orange --", stringColorToRGB("Orange"))
  end
end

-- ===== Paul Atreides 2df658 (1913 chars) =====
function onLoad()
  if Vector.equals(self.getPosition(), Vector({18.00, 1.08, 22.80}), 0.02) then
  self.createButton({
     click_function = "claimLeader",
     function_owner = self,
     label          = "Claim Leader",
     position       = {0,0.2,0.4},
     rotation       = {0, 0, 0},
     scale          = {0.5, 1, 0.5},
     width          = 700,
     height         = 150,
     tooltip        = "",
     font_color     = {1, 1, 1},
     font_size      = 85,
     color          = "Black"
     })
  end
end 

function claimLabel()
  self.createButton({
     click_function = "claimLeader",
     function_owner = self,
     label          = "Claim Leader",
     position       = {0,0.2,0.4},
     rotation       = {0, 0, 0},
     scale          = {0.5, 1, 0.5},
     width          = 700,
     height         = 150,
     tooltip        = "",
     font_color     = {1, 1, 1},
     font_size      = 85,
     color          = "Black"
     })
end	 

function claimLeader(GO, color)
  if color == "Red" then
    leaderPos = {-40.00, 2, -12.89}
    leaderRot = {0.00, 180.00, 0.00}
    GO.setPositionSmooth(leaderPos)
    GO.setRotationSmooth(leaderRot)
    GO.clearButtons()
  elseif color == "Blue" then
    leaderPos = {-15.00, 2, -12.89}
    leaderRot = {0.00, 180.00, 0.00}
    GO.setPositionSmooth(leaderPos)
    GO.setRotationSmooth(leaderRot)
    GO.clearButtons()
  elseif color == "Orange" then
    leaderPos = {15.00, 2, -12.89}
    leaderRot = {0.00, 180.00, 0.00}
    GO.setPositionSmooth(leaderPos)
    GO.setRotationSmooth(leaderRot)
    GO.clearButtons()
  elseif color == "Green" then
    leaderPos = {40.00, 2, -12.89}
    leaderRot = {0.00, 180.00, 0.00}
    GO.setPositionSmooth(leaderPos)
    GO.setRotationSmooth(leaderRot)
    GO.clearButtons()
  else
    printToAll("Cannot Select Leader Until the Player is Seated!")
  end
end

-- ===== Countess Thorvald 4d862a (1912 chars) =====
function onLoad()
  if Vector.equals(self.getPosition(), Vector({6.00, 1.08, 22.80}), 0.02) then
  self.createButton({
     click_function = "claimLeader",
     function_owner = self,
     label          = "Claim Leader",
     position       = {0,0.2,0.4},
     rotation       = {0, 0, 0},
     scale          = {0.5, 1, 0.5},
     width          = 700,
     height         = 150,
     tooltip        = "",
     font_color     = {1, 1, 1},
     font_size      = 85,
     color          = "Black"
     })
  end
end 

function claimLabel()
  self.createButton({
     click_function = "claimLeader",
     function_owner = self,
     label          = "Claim Leader",
     position       = {0,0.2,0.4},
     rotation       = {0, 0, 0},
     scale          = {0.5, 1, 0.5},
     width          = 700,
     height         = 150,
     tooltip        = "",
     font_color     = {1, 1, 1},
     font_size      = 85,
     color          = "Black"
     })
end	 

function claimLeader(GO, color)
  if color == "Red" then
    leaderPos = {-40.00, 2, -12.89}
    leaderRot = {0.00, 180.00, 0.00}
    GO.setPositionSmooth(leaderPos)
    GO.setRotationSmooth(leaderRot)
    GO.clearButtons()
  elseif color == "Blue" then
    leaderPos = {-15.00, 2, -12.89}
    leaderRot = {0.00, 180.00, 0.00}
    GO.setPositionSmooth(leaderPos)
    GO.setRotationSmooth(leaderRot)
    GO.clearButtons()
  elseif color == "Orange" then
    leaderPos = {15.00, 2, -12.89}
    leaderRot = {0.00, 180.00, 0.00}
    GO.setPositionSmooth(leaderPos)
    GO.setRotationSmooth(leaderRot)
    GO.clearButtons()
  elseif color == "Green" then
    leaderPos = {40.00, 2, -12.89}
    leaderRot = {0.00, 180.00, 0.00}
    GO.setPositionSmooth(leaderPos)
    GO.setRotationSmooth(leaderRot)
    GO.clearButtons()
  else
    printToAll("Cannot Select Leader Until the Player is Seated!")
  end
end

-- ===== Helena Richese 5a8a9a (1912 chars) =====
function onLoad()
  if Vector.equals(self.getPosition(), Vector({12.00, 1.08, 22.80}), 0.02) then
  self.createButton({
     click_function = "claimLeader",
     function_owner = self,
     label          = "Claim Leader",
     position       = {0,0.2,0.4},
     rotation       = {0, 0, 0},
     scale          = {0.5, 1, 0.5},
     width          = 700,
     height         = 150,
     tooltip        = "",
     font_color     = {1, 1, 1},
     font_size      = 85,
     color          = "Black"
     })
  end
end 

function claimLabel()
  self.createButton({
     click_function = "claimLeader",
     function_owner = self,
     label          = "Claim Leader",
     position       = {0,0.2,0.4},
     rotation       = {0, 0, 0},
     scale          = {0.5, 1, 0.5},
     width          = 700,
     height         = 150,
     tooltip        = "",
     font_color     = {1, 1, 1},
     font_size      = 85,
     color          = "Black"
     })
end
	 
function claimLeader(GO, color)
  if color == "Red" then
    leaderPos = {-40.00, 2, -12.89}
    leaderRot = {0.00, 180.00, 0.00}
    GO.setPositionSmooth(leaderPos)
    GO.setRotationSmooth(leaderRot)
    GO.clearButtons()
  elseif color == "Blue" then
    leaderPos = {-15.00, 2, -12.89}
    leaderRot = {0.00, 180.00, 0.00}
    GO.setPositionSmooth(leaderPos)
    GO.setRotationSmooth(leaderRot)
    GO.clearButtons()
  elseif color == "Orange" then
    leaderPos = {15.00, 2, -12.89}
    leaderRot = {0.00, 180.00, 0.00}
    GO.setPositionSmooth(leaderPos)
    GO.setRotationSmooth(leaderRot)
    GO.clearButtons()
  elseif color == "Green" then
    leaderPos = {40.00, 2, -12.89}
    leaderRot = {0.00, 180.00, 0.00}
    GO.setPositionSmooth(leaderPos)
    GO.setRotationSmooth(leaderRot)
    GO.clearButtons()
  else
    printToAll("Cannot Select Leader Until the Player is Seated!")
  end
end

-- ===== Baron Harkonnen 98cae8 (3485 chars) =====
harkonnenTokens = {"690202", "cd9759", "88e4de", "dadf18"}
hiddenPlayerZones = {"6e6944", "b1eaa5", "73df06", "dda0f6"}
offsetHidden = {-1.9, -0.65, 0.65, 1.9}

function onLoad()
  if Vector.equals(self.getPosition(), Vector({-6.00, 1.08, 22.80}), 0.02) then
  self.createButton({
     click_function = "claimLeader",
     function_owner = self,
     label          = "Claim Leader",
     position       = {0,0.2,0.4},
     rotation       = {0, 0, 0},
     scale          = {0.5, 1, 0.5},
     width          = 700,
     height         = 150,
     tooltip        = "",
     font_color     = {1, 1, 1},
     font_size      = 85,
     color          = "Black"
     })
  end
end 
	 
function claimLabel()
  self.createButton({
     click_function = "claimLeader",
     function_owner = self,
     label          = "Claim Leader",
     position       = {0,0.2,0.4},
     rotation       = {0, 0, 0},
     scale          = {0.5, 1, 0.5},
     width          = 700,
     height         = 150,
     tooltip        = "",
     font_color     = {1, 1, 1},
     font_size      = 85,
     color          = "Black"
     })
end

function claimLeader(GO, color)
  if color == "Red" then
    leaderPos = {-40.00, 2, -12.89}
    leaderRot = {0.00, 180.00, 0.00}
    GO.setPositionSmooth(leaderPos)
    GO.setRotationSmooth(leaderRot)
    GO.clearButtons()

    for i=1, 4 do
      local hiddenPos = getObjectFromGUID(hiddenPlayerZones[1]).getPosition()
      hiddenPos.x = hiddenPos.x + offsetHidden[i]     
      hiddenPos.y = 1.5
      hiddenPos.z = -8
      getObjectFromGUID(harkonnenTokens[i]).setPositionSmooth(hiddenPos)
      getObjectFromGUID(harkonnenTokens[i]).setRotationSmooth(leaderRot)
    end
  elseif color == "Blue" then
    leaderPos = {-15.00, 2, -12.89}
    leaderRot = {0.00, 180.00, 0.00}
    GO.setPositionSmooth(leaderPos)
    GO.setRotationSmooth(leaderRot)
    GO.clearButtons()

    for i=1, 4 do 
      local hiddenPos = getObjectFromGUID(hiddenPlayerZones[2]).getPosition()
      hiddenPos.x = hiddenPos.x + offsetHidden[i]     
      hiddenPos.y = 1.5
      hiddenPos.z = -8
      getObjectFromGUID(harkonnenTokens[i]).setPositionSmooth(hiddenPos)
      getObjectFromGUID(harkonnenTokens[i]).setRotationSmooth(leaderRot)
    end
  elseif color == "Orange" then
    leaderPos = {15.00, 2, -12.89}
    leaderRot = {0.00, 180.00, 0.00}
    GO.setPositionSmooth(leaderPos)
    GO.setRotationSmooth(leaderRot)
    GO.clearButtons()

    for i=1, 4 do 
      local hiddenPos = getObjectFromGUID(hiddenPlayerZones[3]).getPosition()
      hiddenPos.x = hiddenPos.x + offsetHidden[i]     
      hiddenPos.y = 1.5
      hiddenPos.z = -8
      getObjectFromGUID(harkonnenTokens[i]).setPositionSmooth(hiddenPos)
      getObjectFromGUID(harkonnenTokens[i]).setRotationSmooth(leaderRot)
    end
  elseif color == "Green" then
    leaderPos = {40.00, 2, -12.89}
    leaderRot = {0.00, 180.00, 0.00}
    GO.setPositionSmooth(leaderPos)
    GO.setRotationSmooth(leaderRot)
    GO.clearButtons()

    for i=1, 4 do 
      local hiddenPos = getObjectFromGUID(hiddenPlayerZones[4]).getPosition()
      hiddenPos.x = hiddenPos.x + offsetHidden[i]     
      hiddenPos.y = 1.5
      hiddenPos.z = -8
      getObjectFromGUID(harkonnenTokens[i]).setPositionSmooth(hiddenPos)
      getObjectFromGUID(harkonnenTokens[i]).setRotationSmooth(leaderRot)
    end
  else
    printToAll("Cannot Select Leader Until the Player is Seated!")
  end
end

-- ===== Emperor Alliance Token 13e990 (4256 chars) =====
leaderZones = {"019932", "922c70", "5fbaf4", "cef5cb"}
colorRef = {["Red"] = 1, ["Blue"] = 2, ["Orange"] = 3, ["Green"] = 4}

allianceDetails = {"",14.85}

rivalColor = ""
rivalCheck = {0,0,0,0}
playerPingCount = 0
playerCheck = 0

function resetSave()
  allianceDetails = {"",14.85}

  rivalColor = ""
  rivalCheck = {0,0,0,0}
  playerPingCount = 0
  playerCheck = 0
end

function onSave()
  local ad = allianceDetails
  local data_to_save = {ad}

  saved_data_emp = JSON.encode(data_to_save)
  return saved_data_emp
end

function onLoad(saved_data_emp)
 if saved_data_emp ~= "" and saved_data_emp ~= nil then
    local loaded_data = JSON.decode(saved_data_emp)

    allianceDetails = loaded_data[1]

    if allianceDetails == nil then
      allianceDetails = {"",2.55}
    end
 else
   allianceDetails = {"",2.55}
   rivalColor = ""
   playerPingCount = 0
   playerCheck = 0
 end
end

function onCollisionEnter(info)
  checkPlayerRival()

  if info.collision_object.tag == "Block" then
    local pos = getObjectFromGUID(leaderZones[colorRef[info.collision_object.getName()]]).getPosition()
    pos.y = 2.5
    self.setPositionSmooth(pos, false,true)
    local vpCall = ("up" .. info.collision_object.getName())
    local colorD = info.collision_object.getName()
    local colorP = round(info.collision_object.getPosition().z,2)

    if colorP >= 13.33 and colorP <= 13.45 then
      colorP = 13.38
    elseif colorP >= 14.09 and colorP <= 14.17 then
      colorP = 14.12
    elseif colorP >= 14.75 and colorP <= 14.85 then
      colorP = 14.80
    end  

    allianceDetails[1] = colorD
    allianceDetails[2] = colorP

    if playerPingCount != 2 then
      getObjectFromGUID("2da390").call(vpCall,{})
    elseif playerPingCount == 2 then
      if info.collision_object.getName() != rivalColor then
        getObjectFromGUID("2da390").call(vpCall,{})
      end
    end
  end
end

function allianceCheck(blockDetails)
 Wait.frames(function()
  if round(blockDetails[1][1].getPosition().z,2) > allianceDetails[2] then
   if blockDetails[1][1].getName() != allianceDetails[1] then
    if playerPingCount != 2 then
      local vpCall = ("up" .. blockDetails[1][1].getName())
      getObjectFromGUID("2da390").call(vpCall,{})
      local vpCall = ("down" .. allianceDetails[1])
      Wait.frames(function()
        getObjectFromGUID("2da390").call(vpCall,{})
      end,15)
    elseif playerPingCount == 2 then
      if blockDetails[1][1].getName() != rivalColor then
        local vpCall = ("up" .. blockDetails[1][1].getName())
        getObjectFromGUID("2da390").call(vpCall,{})
        local vpCall = ("down" .. allianceDetails[1])
        if allianceDetails[1] != rivalColor then
          Wait.frames(function()
            getObjectFromGUID("2da390").call(vpCall,{})
          end,15)
        end
      else
        local vpCall = ("down" .. allianceDetails[1])
        getObjectFromGUID("2da390").call(vpCall,{})
      end
    end

    allianceDetails[1] = blockDetails[1][1].getName()
    allianceDetails[2] = round(blockDetails[1][1].getPosition().z,2)
    local pos = getObjectFromGUID(leaderZones[colorRef[allianceDetails[1]]]).getPosition()
    pos.y = 2.5
    self.setPositionSmooth(pos, false,true)
   elseif blockDetails[1][1].getName() == allianceDetails[1] then
    allianceDetails[2] = round(blockDetails[1][1].getPosition().z,2)
   end
  end
 end,15)
end

function round(num, dec)
  local mult = 10^(dec or 0)
  return math.floor(num * mult + 0.5) / mult
end

function checkPlayerRival()
  rivalColor = ""
  playerPingCount = 0
  playerCheck = Player.getPlayers()

  for _, playerPing in ipairs(playerCheck) do
    if playerPing.color == "Red" or playerPing.color == "Blue" or playerPing.color == "Orange" or playerPing.color == "Green" then
      playerPingCount = playerPingCount + 1
    end
  end

  if playerPingCount == 2 then  
    if Global.getVar("rivals")[1] == 1 then
      rivalColor = "Red"
    elseif Global.getVar("rivals")[2] == 1 then
      rivalColor = "Blue"
    elseif Global.getVar("rivals")[3] == 1 then
      rivalColor = "Orange"
    elseif Global.getVar("rivals")[4] == 1 then
      rivalColor = "Green"
    end
  end
end

-- ===== Guild Alliance Token ad1aae (4278 chars) =====
leaderZones = {"019932", "922c70", "5fbaf4", "cef5cb"}
colorRef = {["Red"] = 1, ["Blue"] = 2, ["Orange"] = 3, ["Green"] = 4}

allianceDetails = {"",8.75}

rivalColor = ""
rivalCheck = {0,0,0,0}
playerPingCount = 0
playerCheck = 0

function resetSave()
  allianceDetails = {"",14.85}

  rivalColor = ""
  rivalCheck = {0,0,0,0}
  playerPingCount = 0
  playerCheck = 0
end

function onSave()
  local ad = allianceDetails
  local data_to_save = {ad}

  saved_data_guild = JSON.encode(data_to_save)
  return saved_data_guild
end

function onLoad(saved_data_guild)
 if saved_data_guild ~= "" and saved_data_guild ~= nil then
    local loaded_data = JSON.decode(saved_data_guild)

    allianceDetails = loaded_data[1]

    if allianceDetails == nil then
      allianceDetails = {"",2.55}
    end
 else
   allianceDetails = {"",2.55}
   rivalColor = ""
   playerPingCount = 0
   playerCheck = 0
 end
end

function onCollisionEnter(info)
  checkPlayerRival()

  if info.collision_object.tag == "Block" then
    local pos = getObjectFromGUID(leaderZones[colorRef[info.collision_object.getName()]]).getPosition()
    pos.y = 2.5
    self.setPositionSmooth(pos, false,true)
    local vpCall = ("up" .. info.collision_object.getName())
    local colorD = info.collision_object.getName()
    local colorP = round(info.collision_object.getPosition().z,2)

    if colorP >= 7.15 and colorP <= 7.26 then
      colorP = 7.21
    elseif colorP >= 8.06 and colorP <= 8.19 then
      colorP = 8.11
    elseif colorP >= 8.97 and colorP <= 9.06 then
      colorP = 9.01
    end  

    allianceDetails[1] = colorD
    allianceDetails[2] = colorP

    if playerPingCount != 2 then
      getObjectFromGUID("2da390").call(vpCall,{})
    elseif playerPingCount == 2 then
      if info.collision_object.getName() != rivalColor then
        getObjectFromGUID("2da390").call(vpCall,{})
      end
    end
  end
end

function allianceCheck(blockDetails)
 checkPlayerRival()

 Wait.frames(function()
  if round(blockDetails[1][1].getPosition().z,2) > allianceDetails[2] then
   if blockDetails[1][1].getName() != allianceDetails[1] then
    if playerPingCount != 2 then
      local vpCall = ("up" .. blockDetails[1][1].getName())
      getObjectFromGUID("2da390").call(vpCall,{})
      local vpCall = ("down" .. allianceDetails[1])
      Wait.frames(function()
        getObjectFromGUID("2da390").call(vpCall,{})
      end,15)
    elseif playerPingCount == 2 then
      if blockDetails[1][1].getName() != rivalColor then
        local vpCall = ("up" .. blockDetails[1][1].getName())
        getObjectFromGUID("2da390").call(vpCall,{})
        local vpCall = ("down" .. allianceDetails[1])
        if allianceDetails[1] != rivalColor then
          Wait.frames(function()
            getObjectFromGUID("2da390").call(vpCall,{})
          end,15)
        end
      else
        local vpCall = ("down" .. allianceDetails[1])
        getObjectFromGUID("2da390").call(vpCall,{})
      end
    end

    allianceDetails[1] = blockDetails[1][1].getName()
    allianceDetails[2] = round(blockDetails[1][1].getPosition().z,2)
    local pos = getObjectFromGUID(leaderZones[colorRef[allianceDetails[1]]]).getPosition()
    pos.y = 2.5
    self.setPositionSmooth(pos, false,true)
   elseif blockDetails[1][1].getName() == allianceDetails[1] then
    allianceDetails[2] = round(blockDetails[1][1].getPosition().z,2)
   end
  end
 end,15)
end

function round(num, dec)
  local mult = 10^(dec or 0)
  return math.floor(num * mult + 0.5) / mult
end

function checkPlayerRival()
  rivalColor = ""
  playerPingCount = 0
  playerCheck = Player.getPlayers()

  for _, playerPing in ipairs(playerCheck) do
    if playerPing.color == "Red" or playerPing.color == "Blue" or playerPing.color == "Orange" or playerPing.color == "Green" then
      playerPingCount = playerPingCount + 1
    end
  end

  if playerPingCount == 2 then  
    if Global.getVar("rivals")[1] == 1 then
      rivalColor = "Red"
    elseif Global.getVar("rivals")[2] == 1 then
      rivalColor = "Blue"
    elseif Global.getVar("rivals")[3] == 1 then
      rivalColor = "Orange"
    elseif Global.getVar("rivals")[4] == 1 then
      rivalColor = "Green"
    end
  end
end

-- ===== Custom_Board 7962b9 (6903 chars) =====
function setupAcquire()
  self.createButton({
     click_function = "cardAquireArrakis",
     function_owner = self,
     label          = "Acquire",
     position       = {-5.45,0.6,9},
     rotation       = {0, 0, 0},
     scale          = {0.35, 1, 0.75},
     width          = 3200,
     height         = 1700,
     tooltip        = "",
     font_color     = {1, 1, 1},
     font_size      = 1600,
     color          = {0, 0, 0}
     })
  self.createButton({
     click_function = "cardAquireSpice",
     function_owner = self,
     label          = "Acquire",
     position       = {0,0.6,9},
     rotation       = {0, 0, 0},
     scale          = {0.35, 1, 0.75},
     width          = 3200,
     height         = 1700,
     tooltip        = "",
     font_color     = {1, 1, 1},
     font_size      = 1600,
     color          = {0, 0, 0}
     })
  self.createButton({
     click_function = "cardAquireFoldspace",
     function_owner = self,
     label          = "Acquire",
     position       = {5.45,0.6,9},
     rotation       = {0, 0, 0},
     scale          = {0.35, 1, 0.75},
     width          = 3200,
     height         = 1700,
     tooltip        = "",
     font_color     = {1, 1, 1},
     font_size      = 1600,
     color          = {0, 0, 0}
     })
  self.createButton({
     click_function = "intrigueDraw",
     function_owner = self,
     label          = "Draw Intrigue",
     position       = {-53.80,0.2,9.2},
     rotation       = {0, 0, 0},
     scale          = {0.35, 1, 0.75},
     width          = 5200,
     height         = 1700,
     tooltip        = "",
     font_color     = {1, 1, 1},
     font_size      = 1600,
     color          = {0, 0, 0}
     })
  self.createButton({
     click_function = "doNothing",
     function_owner = self,
     label          = "[Intrigue Discard]",
     position       = {-59.50,0.2,9.2},
     rotation       = {0, 0, 0},
     scale          = {0.35, 1, 0.75},
     width          = 1,
     height         = 1,
     tooltip        = "",
     font_color     = {1, 1, 1},
     font_size      = 1600,
     color          = {0, 0, 0}
     })
end

function cardAquireArrakis(GO, color)
  cardDraw = GetDeckOrCard("71a8c3")

  if cardDraw != nil then

  if cardDraw.name == "Deck" then
    card = cardDraw.takeObject()
  elseif cardDraw.name == "Card" then
    card = cardDraw
  end

  if color == "Red" then
    discardPos = {-35.39, 2, -12.89}
    discardRot = {0.00, 180.00, 0.00}
    card.setPositionSmooth(discardPos)
    card.setRotationSmooth(discardRot)
  elseif color == "Blue" then
    discardPos = {-10.39, 2, -12.89}
    discardRot = {0.00, 180.00, 0.00}
    card.setPositionSmooth(discardPos)
    card.setRotationSmooth(discardRot)
  elseif color == "Orange" then
    discardPos = {19.61, 2, -12.89}
    discardRot = {0.00, 180.00, 0.00}
    card.setPositionSmooth(discardPos)
    card.setRotationSmooth(discardRot)
  elseif color == "Green" then
    discardPos = {44.61, 2, -12.89}
    discardRot = {0.00, 180.00, 0.00}
    card.setPositionSmooth(discardPos)
    card.setRotationSmooth(discardRot)
  end

  else
    printToAll("No Arrakis Liaison Cards Available!")
  end
end

function cardAquireSpice(GO, color)
  cardDraw = GetDeckOrCard("10ddcb")

  if cardDraw != nil then

  if cardDraw.name == "Deck" then
    card = cardDraw.takeObject()
  elseif cardDraw.name == "Card" then
    card = cardDraw
  end

  if color == "Red" then
    discardPos = {-35.39, 2, -12.89}
    discardRot = {0.00, 180.00, 0.00}
    card.setPositionSmooth(discardPos)
    card.setRotationSmooth(discardRot)
  elseif color == "Blue" then
    discardPos = {-10.39, 2, -12.89}
    discardRot = {0.00, 180.00, 0.00}
    card.setPositionSmooth(discardPos)
    card.setRotationSmooth(discardRot)
  elseif color == "Orange" then
    discardPos = {19.61, 2, -12.89}
    discardRot = {0.00, 180.00, 0.00}
    card.setPositionSmooth(discardPos)
    card.setRotationSmooth(discardRot)
  elseif color == "Green" then
    discardPos = {44.61, 2, -12.89}
    discardRot = {0.00, 180.00, 0.00}
    card.setPositionSmooth(discardPos)
    card.setRotationSmooth(discardRot)
  end

  else
    printToAll("No Spice Must Flow Cards Available!")
  end
end

function cardAquireFoldspace(GO, color)
  cardDraw = GetDeckOrCard("abef9a")

  if cardDraw != nil then

  if cardDraw.name == "Deck" then
    card = cardDraw.takeObject()
  elseif cardDraw.name == "Card" then
    card = cardDraw
  end

  if color == "Red" then
    discardPos = {-35.39, 2, -12.89}
    discardRot = {0.00, 180.00, 0.00}
    card.setPositionSmooth(discardPos)
    card.setRotationSmooth(discardRot)
  elseif color == "Blue" then
    discardPos = {-10.39, 2, -12.89}
    discardRot = {0.00, 180.00, 0.00}
    card.setPositionSmooth(discardPos)
    card.setRotationSmooth(discardRot)
  elseif color == "Orange" then
    discardPos = {19.61, 2, -12.89}
    discardRot = {0.00, 180.00, 0.00}
    card.setPositionSmooth(discardPos)
    card.setRotationSmooth(discardRot)
  elseif color == "Green" then
    discardPos = {44.61, 2, -12.89}
    discardRot = {0.00, 180.00, 0.00}
    card.setPositionSmooth(discardPos)
    card.setRotationSmooth(discardRot)
  end

  else
    printToAll("No Foldspace Cards Available!")
  end
end

function cardAquireBoardFoldspace(color)
  cardDraw = GetDeckOrCard("abef9a")

  if cardDraw != nil then

  if cardDraw.name == "Deck" then
    card = cardDraw.takeObject()
  elseif cardDraw.name == "Card" then
    card = cardDraw
  end

  if color[1][1] == "Red" then
    discardPos = {-35.39, 2, -12.89}
    discardRot = {0.00, 180.00, 0.00}
    card.setPositionSmooth(discardPos)
    card.setRotationSmooth(discardRot)
  elseif color[1][1] == "Blue" then
    discardPos = {-10.39, 2, -12.89}
    discardRot = {0.00, 180.00, 0.00}
    card.setPositionSmooth(discardPos)
    card.setRotationSmooth(discardRot)
  elseif color[1][1] == "Orange" then
    discardPos = {19.61, 2, -12.89}
    discardRot = {0.00, 180.00, 0.00}
    card.setPositionSmooth(discardPos)
    card.setRotationSmooth(discardRot)
  elseif color[1][1] == "Green" then
    discardPos = {44.61, 2, -12.89}
    discardRot = {0.00, 180.00, 0.00}
    card.setPositionSmooth(discardPos)
    card.setRotationSmooth(discardRot)
  end

  else
    printToAll("No Foldspace Cards Available!")
  end
end

function GetDeckOrCard(zoneGUID)
  for _, obj in ipairs(getObjectFromGUID(zoneGUID).getObjects()) do
    if obj.name == "Card" or obj.name == "CardCustom" or obj.name == "Deck" or obj.name == "DeckCustom" then
      return obj
    end
  end

 return nil
end

function intrigueDraw(GO, color)
  intrigueDeck = GetDeckOrCard("e9f30d")
  intrigueDeck.deal(1,color,1)
end

function intrigueBoardDraw(color)
  intrigueDeck = GetDeckOrCard("e9f30d")
  intrigueDeck.deal(1,color[1][1],1)
end

function doNothing()
end

-- ===== Bene Gesserit Alliance Token 33452e (4244 chars) =====
leaderZones = {"019932", "922c70", "5fbaf4", "cef5cb"}
colorRef = {["Red"] = 1, ["Blue"] = 2, ["Orange"] = 3, ["Green"] = 4}

allianceDetails = {"",2.55}

rivalColor = ""
rivalCheck = {0,0,0,0}
playerPingCount = 0
playerCheck = 0

function resetSave()
  allianceDetails = {"",14.85}

  rivalColor = ""
  rivalCheck = {0,0,0,0}
  playerPingCount = 0
  playerCheck = 0
end

function onSave()
  local ad = allianceDetails
  local data_to_save = {ad}

  saved_data_bene = JSON.encode(data_to_save)
  return saved_data_bene
end

function onLoad(saved_data_bene)
 if saved_data_bene ~= "" and saved_data_bene ~= nil then
    local loaded_data = JSON.decode(saved_data_bene)

    allianceDetails = loaded_data[1]

    if allianceDetails == nil then
      allianceDetails = {"",2.55}
    end
 else
   allianceDetails = {"",2.55}
   rivalColor = ""
   playerPingCount = 0
   playerCheck = 0
 end
end

function onCollisionEnter(info)
  checkPlayerRival()

  if info.collision_object.tag == "Block" then
    local pos = getObjectFromGUID(leaderZones[colorRef[info.collision_object.getName()]]).getPosition()
    pos.y = 2.5
    self.setPositionSmooth(pos, false,true)
    local vpCall = ("up" .. info.collision_object.getName())
    local colorD = info.collision_object.getName()
    local colorP = round(info.collision_object.getPosition().z,2)

    if colorP >= 1.03 and colorP <= 1.10 then
      colorP = 1.06
    elseif colorP >= 1.76 and colorP <= 1.85 then
      colorP = 1.80
    elseif colorP >= 2.50 and colorP <= 2.58 then
      colorP = 2.53
    end  

    allianceDetails[1] = colorD
    allianceDetails[2] = colorP

    if playerPingCount != 2 then
      getObjectFromGUID("2da390").call(vpCall,{})
    elseif playerPingCount == 2 then
      if info.collision_object.getName() != rivalColor then
        getObjectFromGUID("2da390").call(vpCall,{})
      end
    end
  end
end

function allianceCheck(blockDetails)
 checkPlayerRival()

 Wait.frames(function()
  if round(blockDetails[1][1].getPosition().z,2) > allianceDetails[2] then
   if blockDetails[1][1].getName() != allianceDetails[1] then
    if playerPingCount != 2 then
      local vpCall = ("up" .. blockDetails[1][1].getName())
      getObjectFromGUID("2da390").call(vpCall,{})
      local vpCall = ("down" .. allianceDetails[1])
      Wait.frames(function()
        getObjectFromGUID("2da390").call(vpCall,{})
      end,15)
    elseif playerPingCount == 2 then
      if blockDetails[1][1].getName() != rivalColor then
        local vpCall = ("up" .. blockDetails[1][1].getName())
        getObjectFromGUID("2da390").call(vpCall,{})
        local vpCall = ("down" .. allianceDetails[1])
        if allianceDetails[1] != rivalColor then
          Wait.frames(function()
            getObjectFromGUID("2da390").call(vpCall,{})
          end,15)
        end
      else
        local vpCall = ("down" .. allianceDetails[1])
        getObjectFromGUID("2da390").call(vpCall,{})
      end
    end

    allianceDetails[1] = blockDetails[1][1].getName()
    allianceDetails[2] = round(blockDetails[1][1].getPosition().z,2)
    local pos = getObjectFromGUID(leaderZones[colorRef[allianceDetails[1]]]).getPosition()
    pos.y = 2.5
    self.setPositionSmooth(pos, false,true)
   elseif blockDetails[1][1].getName() == allianceDetails[1] then
    allianceDetails[2] = round(blockDetails[1][1].getPosition().z,2)
   end
  end
 end,15)
end

function round(num, dec)
  local mult = 10^(dec or 0)
  return math.floor(num * mult + 0.5) / mult
end

function checkPlayerRival()
  rivalColor = ""
  playerPingCount = 0
  playerCheck = Player.getPlayers()

  for _, playerPing in ipairs(playerCheck) do
    if playerPing.color == "Red" or playerPing.color == "Blue" or playerPing.color == "Orange" or playerPing.color == "Green" then
      playerPingCount = playerPingCount + 1
    end
  end

  if playerPingCount == 2 then  
    if Global.getVar("rivals")[1] == 1 then
      rivalColor = "Red"
    elseif Global.getVar("rivals")[2] == 1 then
      rivalColor = "Blue"
    elseif Global.getVar("rivals")[3] == 1 then
      rivalColor = "Orange"
    elseif Global.getVar("rivals")[4] == 1 then
      rivalColor = "Green"
    end
  end
end

-- ===== Fremen Alliance Token 4c2bcc (4214 chars) =====
leaderZones = {"019932", "922c70", "5fbaf4", "cef5cb"}
colorRef = {["Red"] = 1, ["Blue"] = 2, ["Orange"] = 3, ["Green"] = 4}

allianceDetails = {"",-3.50}

rivalColor = ""
rivalCheck = {0,0,0,0}
playerPingCount = 0
playerCheck = 0

function resetSave()
  allianceDetails = {"",14.85}

  rivalColor = ""
  rivalCheck = {0,0,0,0}
  playerPingCount = 0
  playerCheck = 0
end

function onSave()
  local ad = allianceDetails
  local data_to_save = {ad}

  saved_data_fremen = JSON.encode(data_to_save)
  return saved_data_fremen
end

function onLoad(saved_data_fremen)
 if saved_data_fremen ~= "" and saved_data_fremen ~= nil then
    local loaded_data = JSON.decode(saved_data_fremen)

    allianceDetails = loaded_data[1]

    if allianceDetails == nil then
      allianceDetails = {"",2.55}
    end
 else
   allianceDetails = {"",2.55}
   rivalColor = ""
   playerPingCount = 0
   playerCheck = 0
 end
end

function onCollisionEnter(info)
  checkPlayerRival()

  if info.collision_object.tag == "Block" then
    local pos = getObjectFromGUID(leaderZones[colorRef[info.collision_object.getName()]]).getPosition()
    pos.y = 2.5
    self.setPositionSmooth(pos, false,true)
    local vpCall = ("up" .. info.collision_object.getName())
    local colorD = info.collision_object.getName()
    local colorP = round(info.collision_object.getPosition().z,2)

    if colorP >= -5.05 and colorP <= -5.00 then
      colorP = -5.02
    elseif colorP >= -4.33 and colorP <= -4.23 then
      colorP = -4.29
    elseif colorP >= -3.67 and colorP <= -3.60 then
      colorP = -3.62
    end

    allianceDetails[1] = colorD
    allianceDetails[2] = colorP

    if playerPingCount != 2 then
      getObjectFromGUID("2da390").call(vpCall,{})
    elseif playerPingCount == 2 then
      if info.collision_object.getName() != rivalColor then
        getObjectFromGUID("2da390").call(vpCall,{})
      end
    end
  end
end

function allianceCheck(blockDetails)
 checkPlayerRival()

 Wait.frames(function()
  if round(blockDetails[1][1].getPosition().z,2) > allianceDetails[2] then
   if blockDetails[1][1].getName() != allianceDetails[1] then
    if playerPingCount != 2 then
      local vpCall = ("up" .. blockDetails[1][1].getName())
      getObjectFromGUID("2da390").call(vpCall,{})
      local vpCall = ("down" .. allianceDetails[1])
      Wait.frames(function()
        getObjectFromGUID("2da390").call(vpCall,{})
      end,15)
    elseif playerPingCount == 2 then
      if blockDetails[1][1].getName() != rivalColor then
        local vpCall = ("up" .. blockDetails[1][1].getName())
        getObjectFromGUID("2da390").call(vpCall,{})
        local vpCall = ("down" .. allianceDetails[1])
        if allianceDetails[1] != rivalColor then
          Wait.frames(function()
            getObjectFromGUID("2da390").call(vpCall,{})
          end,15)
        end
      else
        local vpCall = ("down" .. allianceDetails[1])
        getObjectFromGUID("2da390").call(vpCall,{})
      end
    end

    allianceDetails[1] = blockDetails[1][1].getName()
    allianceDetails[2] = round(blockDetails[1][1].getPosition().z,2)
    local pos = getObjectFromGUID(leaderZones[colorRef[allianceDetails[1]]]).getPosition()
    pos.y = 2.5
    self.setPositionSmooth(pos, false,true)
   elseif blockDetails[1][1].getName() == allianceDetails[1] then
    allianceDetails[2] = round(blockDetails[1][1].getPosition().z,2)
   end
  end
 end,15)
end

function round(num, dec)
  local mult = 10^(dec or 0)
  return math.floor(num * mult + 0.5) / mult
end

function checkPlayerRival()
  rivalColor = ""
  playerPingCount = 0
  playerCheck = Player.getPlayers()

  for _, playerPing in ipairs(playerCheck) do
    if playerPing.color == "Red" or playerPing.color == "Blue" or playerPing.color == "Orange" or playerPing.color == "Green" then
      playerPingCount = playerPingCount + 1
    end
  end

  if playerPingCount == 2 then  
    if Global.getVar("rivals")[1] == 1 then
      rivalColor = "Red"
    elseif Global.getVar("rivals")[2] == 1 then
      rivalColor = "Blue"
    elseif Global.getVar("rivals")[3] == 1 then
      rivalColor = "Orange"
    elseif Global.getVar("rivals")[4] == 1 then
      rivalColor = "Green"
    end
  end
end

-- ===== Trash 288283 (691 chars) =====
function onLoad()
 resetCheck = 0
 if resetCheck == 1 then
  self.clearButtons()
  self.createButton ({
    ['click_function'] = 'resetSavedData',
    ['label'] = 'Reset Saved Data',
    ['function_owner'] = self,
    ['position'] = {2.0, 0.2, 0.0},
    ['rotation'] =  {0, 270, 0},
    ['width'] = 1200,
    ['height'] = 250,
    ['font_size'] = 100,
    ['color'] = "Black",
    ['font_color'] = "White"
  })
 end
end

function resetSavedData()
  Global.call("resetSave",{})
  getObjectFromGUID("13e990").call("resetSave",{})
  getObjectFromGUID("ad1aae").call("resetSave",{})
  getObjectFromGUID("33452e").call("resetSave",{})
  getObjectFromGUID("4c2bcc").call("resetSave",{})
end

-- ===== Mentat e7e9b1 (495 chars) =====
playerColor = ""

function onDrop(pColor)
  playerColor = pColor
end

function onPickUp(pColor)
  playerColor = pColor
end

function onCollisionEnter(info)
  if info.collision_object.getGUID() == "a0fa97" then
    playerColor = "Red"
  elseif info.collision_object.getGUID() == "042887" then
    playerColor = "Blue"
  elseif info.collision_object.getGUID() == "e435ab" then
    playerColor = "Orange"
  elseif info.collision_object.getGUID() == "f8a49f" then
    playerColor = "Green"
  end
end

-- ===== Right_Drawer 477241 (3142 chars) =====
self.setName("Right_Drawer")

function onload()
    self.interactable = false

    pos_uni = self.getPosition()
    eixo_x = pos_uni.x

    if eixo_x > -48 then
        fechado = true
    else
        fechado = false
    end

    self.createButton({
    label = "",
    tooltip = "Push/Pull",
    click_function = "clicado",
    function_owner = self,
    width = 8000,
    height = 1000,
    position = {0.1, 1, 14},
    rotation = {-90, 0, 0},
    color = {255,255,255,0}
    })
end

function clicado()
    if fechado then
        local distance = 25
        self_current = self.getPosition()
        self_target = self.getTransformForward()
        local pos = {
            x = self_current.x + self_target.x * distance,
            y = self_current.y + self_target.y * distance,
            z = self_current.z + self_target.z * distance,
        }
        if alvo != nil then
            self.setPositionSmooth(pos, true, true)
            for _, obj in ipairs(alvo) do
                recuperar(obj)
            end
        else
            self.setPositionSmooth(pos)
        end
        fechado = false
    
    else
        alvo = findInRadiusBy(self.getPosition(),24)
        distance = -25
        self_current = self.getPosition()
        self_target = self.getTransformForward()
        pos = {
            x = self_current.x + self_target.x * distance,
            y = self_current.y + self_target.y * distance,
            z = self_current.z + self_target.z * distance,
        }
        if alvo != nil then
            for _, obj in ipairs(alvo) do
                guardar(obj)
            end
            self.setPositionSmooth(pos)
        else
            self.setPositionSmooth(pos)
        end
        fechado = true
    end
end

function guardar(obj)
    local pos_original = obj.getPosition()
    local lock_check = obj.getLock()
    obj.setPosition({
        x = pos_original.x,
        y = pos_original.y-5000,
        z = pos_original.z
        })
    obj.setVar("Lock_Status", lock_check)
    obj.interactable = false
    obj.setLock(true)
end

function recuperar(obj)
    local pos_original = obj.getPosition()
    	local originalLockStatus = obj.getVar("Lock_Status")
    obj.setPosition({
        x = pos_original.x,
        y = pos_original.y+5000.7,
        z = pos_original.z
        })
        	
    obj.interactable = true
	
        	if originalLockStatus ~= nil and originalLockStatus == true then
            		obj.setLock(true)
        	else
            		obj.setLock(false)
        	end
end

function findInRadiusBy(pos, radius, func, debug)
    local radius = (radius or 1)
    local objList = Physics.cast({
        origin=pos, direction={0,1,0}, type=3, size={radius,4,radius*2.1},
        max_distance=0, debug=(debug or false)
    })

    local refinedList = {}
    for _, obj in ipairs(objList) do
        if func == nil then
            table.insert(refinedList, obj.hit_object)
        else
            if func(obj.hit_object) then
                table.insert(refinedList, obj.hit_object)
            end
        end
    end

    return refinedList
end

-- ===== Left_Drawer 7b2450 (3140 chars) =====
self.setName("Left_Drawer")

function onload()
    self.interactable = false

    pos_uni = self.getPosition()
    eixo_x = pos_uni.x

    if eixo_x < 48 then
        fechado = true
    else
        fechado = false
    end

    self.createButton({
    label = "",
    tooltip = "Push/Pull",
    click_function = "clicado",
    function_owner = self,
    width = 8000,
    height = 1000,
    position = {0.1, 1, 14},
    rotation = {-90, 0, 0},
    color = {255,255,255,0}
    })
end

function clicado()
    if fechado then
        local distance = 25
        self_current = self.getPosition()
        self_target = self.getTransformForward()
        local pos = {
            x = self_current.x + self_target.x * distance,
            y = self_current.y + self_target.y * distance,
            z = self_current.z + self_target.z * distance,
        }
        if alvo != nil then
            self.setPositionSmooth(pos, true, true)
            for _, obj in ipairs(alvo) do
                recuperar(obj)
            end
        else
            self.setPositionSmooth(pos)
        end
        fechado = false
    
    else
        alvo = findInRadiusBy(self.getPosition(),24)
        distance = -25
        self_current = self.getPosition()
        self_target = self.getTransformForward()
        pos = {
            x = self_current.x + self_target.x * distance,
            y = self_current.y + self_target.y * distance,
            z = self_current.z + self_target.z * distance,
        }
        if alvo != nil then
            for _, obj in ipairs(alvo) do
                guardar(obj)
            end
            self.setPositionSmooth(pos)
        else
            self.setPositionSmooth(pos)
        end
        fechado = true
    end
end

function guardar(obj)
    local pos_original = obj.getPosition()
    local lock_check = obj.getLock()
    obj.setPosition({
        x = pos_original.x,
        y = pos_original.y-5000,
        z = pos_original.z
        })
    obj.setVar("Lock_Status", lock_check)
    obj.interactable = false
    obj.setLock(true)
end

function recuperar(obj)
    local pos_original = obj.getPosition()
    	local originalLockStatus = obj.getVar("Lock_Status")
    obj.setPosition({
        x = pos_original.x,
        y = pos_original.y+5000.7,
        z = pos_original.z
        })
        	
    obj.interactable = true
	
        	if originalLockStatus ~= nil and originalLockStatus == true then
            		obj.setLock(true)
        	else
            		obj.setLock(false)
        	end
end

function findInRadiusBy(pos, radius, func, debug)
    local radius = (radius or 1)
    local objList = Physics.cast({
        origin=pos, direction={0,1,0}, type=3, size={radius,4,radius*2.1},
        max_distance=0, debug=(debug or false)
    })

    local refinedList = {}
    for _, obj in ipairs(objList) do
        if func == nil then
            table.insert(refinedList, obj.hit_object)
        else
            if func(obj.hit_object) then
                table.insert(refinedList, obj.hit_object)
            end
        end
    end

    return refinedList
end

-- ===== Purple_Drawer 51e417 (3136 chars) =====
self.setName("Purple_Drawer")

function onload()
    self.interactable = false

    pos_uni = self.getPosition()
    eixo_z = pos_uni.z

    if eixo_z > -20 then
        fechado = true
    else
        fechado = false
    end

    self.createButton({
    label = "",
    tooltip = "Push/Pull",
    click_function = "clicado",
    function_owner = self,
    width = 960,
    height = 700,
    position = {0, 1, 9.5},
    rotation = {-90, 0, 0},
    color = {255,255,255,0}
    })
end

function clicado()
    if fechado then
        local distance = 15
        self_current = self.getPosition()
        self_target = self.getTransformForward()
        local pos = {
            x = self_current.x + self_target.x * distance,
            y = self_current.y + self_target.y * distance,
            z = self_current.z + self_target.z * distance,
        }
        if alvo != nil then
            self.setPositionSmooth(pos, true, true)
            for _, obj in ipairs(alvo) do
                recuperar(obj)
            end
        else
            self.setPositionSmooth(pos)
        end
        fechado = false
    
    else
        alvo = findInRadiusBy(self.getPosition(), 15)
        distance = -15
        self_current = self.getPosition()
        self_target = self.getTransformForward()
        pos = {
            x = self_current.x + self_target.x * distance,
            y = self_current.y + self_target.y * distance,
            z = self_current.z + self_target.z * distance,
        }
        if alvo != nil then
            for _, obj in ipairs(alvo) do
                guardar(obj)
            end
            self.setPositionSmooth(pos)
        else
            self.setPositionSmooth(pos)
        end
        fechado = true
    end
end

function guardar(obj)
    local pos_original = obj.getPosition()
    local lock_check = obj.getLock()
    obj.setPosition({
        x = pos_original.x,
        y = pos_original.y-5000,
        z = pos_original.z
        })
    obj.setVar("Lock_Status", lock_check)
    obj.interactable = false
    obj.setLock(true)
end

function recuperar(obj)
    local pos_original = obj.getPosition()
    	local originalLockStatus = obj.getVar("Lock_Status")
    obj.setPosition({
        x = pos_original.x,
        y = pos_original.y+5000.6,
        z = pos_original.z
        })
        	
    obj.interactable = true
	
        	if originalLockStatus ~= nil and originalLockStatus == true then
            		obj.setLock(true)
        	else
            		obj.setLock(false)
        	end
end

function findInRadiusBy(pos, radius, func, debug)
    local radius = (radius or 1)
    local objList = Physics.cast({
        origin=pos, direction={0,1,0}, type=3, size={radius,4,radius},
        max_distance=0, debug=(debug or false)
    })

    local refinedList = {}
    for _, obj in ipairs(objList) do
        if func == nil then
            table.insert(refinedList, obj.hit_object)
        else
            if func(obj.hit_object) then
                table.insert(refinedList, obj.hit_object)
            end
        end
    end

    return refinedList
end

-- ===== White_Drawer 3bfb9c (3135 chars) =====
self.setName("White_Drawer")

function onload()
    self.interactable = false

    pos_uni = self.getPosition()
    eixo_z = pos_uni.z

    if eixo_z > -20 then
        fechado = true
    else
        fechado = false
    end

    self.createButton({
    label = "",
    tooltip = "Push/Pull",
    click_function = "clicado",
    function_owner = self,
    width = 960,
    height = 700,
    position = {0, 1, 9.5},
    rotation = {-90, 0, 0},
    color = {255,255,255,0}
    })
end

function clicado()
    if fechado then
        local distance = 15
        self_current = self.getPosition()
        self_target = self.getTransformForward()
        local pos = {
            x = self_current.x + self_target.x * distance,
            y = self_current.y + self_target.y * distance,
            z = self_current.z + self_target.z * distance,
        }
        if alvo != nil then
            self.setPositionSmooth(pos, true, true)
            for _, obj in ipairs(alvo) do
                recuperar(obj)
            end
        else
            self.setPositionSmooth(pos)
        end
        fechado = false
    
    else
        alvo = findInRadiusBy(self.getPosition(), 15)
        distance = -15
        self_current = self.getPosition()
        self_target = self.getTransformForward()
        pos = {
            x = self_current.x + self_target.x * distance,
            y = self_current.y + self_target.y * distance,
            z = self_current.z + self_target.z * distance,
        }
        if alvo != nil then
            for _, obj in ipairs(alvo) do
                guardar(obj)
            end
            self.setPositionSmooth(pos)
        else
            self.setPositionSmooth(pos)
        end
        fechado = true
    end
end

function guardar(obj)
    local pos_original = obj.getPosition()
    local lock_check = obj.getLock()
    obj.setPosition({
        x = pos_original.x,
        y = pos_original.y-5000,
        z = pos_original.z
        })
    obj.setVar("Lock_Status", lock_check)
    obj.interactable = false
    obj.setLock(true)
end

function recuperar(obj)
    local pos_original = obj.getPosition()
    	local originalLockStatus = obj.getVar("Lock_Status")
    obj.setPosition({
        x = pos_original.x,
        y = pos_original.y+5000.6,
        z = pos_original.z
        })
        	
    obj.interactable = true
	
        	if originalLockStatus ~= nil and originalLockStatus == true then
            		obj.setLock(true)
        	else
            		obj.setLock(false)
        	end
end

function findInRadiusBy(pos, radius, func, debug)
    local radius = (radius or 1)
    local objList = Physics.cast({
        origin=pos, direction={0,1,0}, type=3, size={radius,4,radius},
        max_distance=0, debug=(debug or false)
    })

    local refinedList = {}
    for _, obj in ipairs(objList) do
        if func == nil then
            table.insert(refinedList, obj.hit_object)
        else
            if func(obj.hit_object) then
                table.insert(refinedList, obj.hit_object)
            end
        end
    end

    return refinedList
end

-- ===== Brown_Drawer 11a118 (3135 chars) =====
self.setName("Brown_Drawer")

function onload()
    self.interactable = false

    pos_uni = self.getPosition()
    eixo_z = pos_uni.z

    if eixo_z > -20 then
        fechado = true
    else
        fechado = false
    end

    self.createButton({
    label = "",
    tooltip = "Push/Pull",
    click_function = "clicado",
    function_owner = self,
    width = 960,
    height = 700,
    position = {0, 1, 9.5},
    rotation = {-90, 0, 0},
    color = {255,255,255,0}
    })
end

function clicado()
    if fechado then
        local distance = 15
        self_current = self.getPosition()
        self_target = self.getTransformForward()
        local pos = {
            x = self_current.x + self_target.x * distance,
            y = self_current.y + self_target.y * distance,
            z = self_current.z + self_target.z * distance,
        }
        if alvo != nil then
            self.setPositionSmooth(pos, true, true)
            for _, obj in ipairs(alvo) do
                recuperar(obj)
            end
        else
            self.setPositionSmooth(pos)
        end
        fechado = false
    
    else
        alvo = findInRadiusBy(self.getPosition(), 15)
        distance = -15
        self_current = self.getPosition()
        self_target = self.getTransformForward()
        pos = {
            x = self_current.x + self_target.x * distance,
            y = self_current.y + self_target.y * distance,
            z = self_current.z + self_target.z * distance,
        }
        if alvo != nil then
            for _, obj in ipairs(alvo) do
                guardar(obj)
            end
            self.setPositionSmooth(pos)
        else
            self.setPositionSmooth(pos)
        end
        fechado = true
    end
end

function guardar(obj)
    local pos_original = obj.getPosition()
    local lock_check = obj.getLock()
    obj.setPosition({
        x = pos_original.x,
        y = pos_original.y-5000,
        z = pos_original.z
        })
    obj.setVar("Lock_Status", lock_check)
    obj.interactable = false
    obj.setLock(true)
end

function recuperar(obj)
    local pos_original = obj.getPosition()
    	local originalLockStatus = obj.getVar("Lock_Status")
    obj.setPosition({
        x = pos_original.x,
        y = pos_original.y+5000.6,
        z = pos_original.z
        })
        	
    obj.interactable = true
	
        	if originalLockStatus ~= nil and originalLockStatus == true then
            		obj.setLock(true)
        	else
            		obj.setLock(false)
        	end
end

function findInRadiusBy(pos, radius, func, debug)
    local radius = (radius or 1)
    local objList = Physics.cast({
        origin=pos, direction={0,1,0}, type=3, size={radius,4,radius},
        max_distance=0, debug=(debug or false)
    })

    local refinedList = {}
    for _, obj in ipairs(objList) do
        if func == nil then
            table.insert(refinedList, obj.hit_object)
        else
            if func(obj.hit_object) then
                table.insert(refinedList, obj.hit_object)
            end
        end
    end

    return refinedList
end

-- ===== Red_Drawer 1627ed (3133 chars) =====
self.setName("Red_Drawer")

function onload()
    self.interactable = false

    pos_uni = self.getPosition()
    eixo_z = pos_uni.z

    if eixo_z > -20 then
        fechado = true
    else
        fechado = false
    end

    self.createButton({
    label = "",
    tooltip = "Push/Pull",
    click_function = "clicado",
    function_owner = self,
    width = 960,
    height = 700,
    position = {0, 1, 9.5},
    rotation = {-90, 0, 0},
    color = {255,255,255,0}
    })
end

function clicado()
    if fechado then
        local distance = 15
        self_current = self.getPosition()
        self_target = self.getTransformForward()
        local pos = {
            x = self_current.x + self_target.x * distance,
            y = self_current.y + self_target.y * distance,
            z = self_current.z + self_target.z * distance,
        }
        if alvo != nil then
            self.setPositionSmooth(pos, true, true)
            for _, obj in ipairs(alvo) do
                recuperar(obj)
            end
        else
            self.setPositionSmooth(pos)
        end
        fechado = false
    
    else
        alvo = findInRadiusBy(self.getPosition(), 15)
        distance = -15
        self_current = self.getPosition()
        self_target = self.getTransformForward()
        pos = {
            x = self_current.x + self_target.x * distance,
            y = self_current.y + self_target.y * distance,
            z = self_current.z + self_target.z * distance,
        }
        if alvo != nil then
            for _, obj in ipairs(alvo) do
                guardar(obj)
            end
            self.setPositionSmooth(pos)
        else
            self.setPositionSmooth(pos)
        end
        fechado = true
    end
end

function guardar(obj)
    local pos_original = obj.getPosition()
    local lock_check = obj.getLock()
    obj.setPosition({
        x = pos_original.x,
        y = pos_original.y-5000,
        z = pos_original.z
        })
    obj.setVar("Lock_Status", lock_check)
    obj.interactable = false
    obj.setLock(true)
end

function recuperar(obj)
    local pos_original = obj.getPosition()
    	local originalLockStatus = obj.getVar("Lock_Status")
    obj.setPosition({
        x = pos_original.x,
        y = pos_original.y+5000.6,
        z = pos_original.z
        })
        	
    obj.interactable = true
	
        	if originalLockStatus ~= nil and originalLockStatus == true then
            		obj.setLock(true)
        	else
            		obj.setLock(false)
        	end
end

function findInRadiusBy(pos, radius, func, debug)
    local radius = (radius or 1)
    local objList = Physics.cast({
        origin=pos, direction={0,1,0}, type=3, size={radius,4,radius},
        max_distance=0, debug=(debug or false)
    })

    local refinedList = {}
    for _, obj in ipairs(objList) do
        if func == nil then
            table.insert(refinedList, obj.hit_object)
        else
            if func(obj.hit_object) then
                table.insert(refinedList, obj.hit_object)
            end
        end
    end

    return refinedList
end

-- ===== Blue_Drawer 15af04 (3134 chars) =====
self.setName("Blue_Drawer")

function onload()
    self.interactable = false

    pos_uni = self.getPosition()
    eixo_z = pos_uni.z

    if eixo_z < 20 then
        fechado = true
    else
        fechado = false
    end

    self.createButton({
    label = "",
    tooltip = "Push/Pull",
    click_function = "clicado",
    function_owner = self,
    width = 960,
    height = 700,
    position = {0, 1, 9.5},
    rotation = {-90, 0, 0},
    color = {255,255,255,0}
    })
end

function clicado()
    if fechado then
        local distance = 15
        self_current = self.getPosition()
        self_target = self.getTransformForward()
        local pos = {
            x = self_current.x + self_target.x * distance,
            y = self_current.y + self_target.y * distance,
            z = self_current.z + self_target.z * distance,
        }
        if alvo != nil then
            self.setPositionSmooth(pos, true, true)
            for _, obj in ipairs(alvo) do
                recuperar(obj)
            end
        else
            self.setPositionSmooth(pos)
        end
        fechado = false
    
    else
        alvo = findInRadiusBy(self.getPosition(), 15)
        distance = -15
        self_current = self.getPosition()
        self_target = self.getTransformForward()
        pos = {
            x = self_current.x + self_target.x * distance,
            y = self_current.y + self_target.y * distance,
            z = self_current.z + self_target.z * distance,
        }
        if alvo != nil then
            for _, obj in ipairs(alvo) do
                guardar(obj)
            end
            self.setPositionSmooth(pos)
        else
            self.setPositionSmooth(pos)
        end
        fechado = true
    end
end

function guardar(obj)
    local pos_original = obj.getPosition()
    local lock_check = obj.getLock()
    obj.setPosition({
        x = pos_original.x,
        y = pos_original.y-5000,
        z = pos_original.z
        })
    obj.setVar("Lock_Status", lock_check)
    obj.interactable = false
    obj.setLock(true)
end

function recuperar(obj)
    local pos_original = obj.getPosition()
    	local originalLockStatus = obj.getVar("Lock_Status")
    obj.setPosition({
        x = pos_original.x,
        y = pos_original.y+5000.6,
        z = pos_original.z
        })
        	
    obj.interactable = true
	
        	if originalLockStatus ~= nil and originalLockStatus == true then
            		obj.setLock(true)
        	else
            		obj.setLock(false)
        	end
end

function findInRadiusBy(pos, radius, func, debug)
    local radius = (radius or 1)
    local objList = Physics.cast({
        origin=pos, direction={0,1,0}, type=3, size={radius,4,radius},
        max_distance=0, debug=(debug or false)
    })

    local refinedList = {}
    for _, obj in ipairs(objList) do
        if func == nil then
            table.insert(refinedList, obj.hit_object)
        else
            if func(obj.hit_object) then
                table.insert(refinedList, obj.hit_object)
            end
        end
    end

    return refinedList
end

-- ===== Yellow_Drawer 230f2d (3134 chars) =====
self.setName("Yellow_Drawer")

function onload()
    self.interactable = false

    pos_uni = self.getPosition()
    eixo_z = pos_uni.z

    if eixo_z < 20 then
        fechado = true
    else
        fechado = false
    end

    self.createButton({
    label = "",
    tooltip = "Push/Pull",
    click_function = "clicado",
    function_owner = self,
    width = 960,
    height = 700,
    position = {0, 1, 9.5},
    rotation = {-90, 0, 0},
    color = {255,255,255,0}
    })
end

function clicado()
    if fechado then
        local distance = 15
        self_current = self.getPosition()
        self_target = self.getTransformForward()
        local pos = {
            x = self_current.x + self_target.x * distance,
            y = self_current.y + self_target.y * distance,
            z = self_current.z + self_target.z * distance,
        }
        if alvo != nil then
            self.setPositionSmooth(pos, true, true)
            for _, obj in ipairs(alvo) do
                recuperar(obj)
            end
        else
            self.setPositionSmooth(pos)
        end
        fechado = false
    
    else
        alvo = findInRadiusBy(self.getPosition(), 15)
        distance = -15
        self_current = self.getPosition()
        self_target = self.getTransformForward()
        pos = {
            x = self_current.x + self_target.x * distance,
            y = self_current.y + self_target.y * distance,
            z = self_current.z + self_target.z * distance,
        }
        if alvo != nil then
            for _, obj in ipairs(alvo) do
                guardar(obj)
            end
            self.setPositionSmooth(pos)
        else
            self.setPositionSmooth(pos)
        end
        fechado = true
    end
end

function guardar(obj)
    local pos_original = obj.getPosition()
    local lock_check = obj.getLock()
    obj.setPosition({
        x = pos_original.x,
        y = pos_original.y-5000,
        z = pos_original.z
        })
    obj.setVar("Lock_Status", lock_check)
    obj.interactable = false
    obj.setLock(true)
end

function recuperar(obj)
    local pos_original = obj.getPosition()
    	local originalLockStatus = obj.getVar("Lock_Status")
    obj.setPosition({
        x = pos_original.x,
        y = pos_original.y+5000.6,
        z = pos_original.z
        })
        	
    obj.interactable = true
	
        	if originalLockStatus ~= nil and originalLockStatus == true then
            		obj.setLock(true)
        	else
            		obj.setLock(false)
        	end
end

function findInRadiusBy(pos, radius, func, debug)
    local radius = (radius or 1)
    local objList = Physics.cast({
        origin=pos, direction={0,1,0}, type=3, size={radius,4,radius},
        max_distance=0, debug=(debug or false)
    })

    local refinedList = {}
    for _, obj in ipairs(objList) do
        if func == nil then
            table.insert(refinedList, obj.hit_object)
        else
            if func(obj.hit_object) then
                table.insert(refinedList, obj.hit_object)
            end
        end
    end

    return refinedList
end

-- ===== Green_Drawer 4b29ea (3134 chars) =====
self.setName("Green_Drawer")

function onload()
    self.interactable = false

    pos_uni = self.getPosition()
    eixo_z = pos_uni.z

    if eixo_z < 20 then
        fechado = true
    else
        fechado = false
    end

    self.createButton({
    label = "",
    tooltip = "Push/Pull",
    click_function = "clicado",
    function_owner = self,
    width = 960,
    height = 700,
    position = {0, 1, 9.5},
    rotation = {-90, 0, 0},
    color = {255,255,255,0}
    })
end

function clicado()
    if fechado then
        local distance = 15
        self_current = self.getPosition()
        self_target = self.getTransformForward()
        local pos = {
            x = self_current.x + self_target.x * distance,
            y = self_current.y + self_target.y * distance,
            z = self_current.z + self_target.z * distance,
        }
        if alvo != nil then
            self.setPositionSmooth(pos, true, true)
            for _, obj in ipairs(alvo) do
                recuperar(obj)
            end
        else
            self.setPositionSmooth(pos)
        end
        fechado = false
    
    else
        alvo = findInRadiusBy(self.getPosition(), 15)
        distance = -15
        self_current = self.getPosition()
        self_target = self.getTransformForward()
        pos = {
            x = self_current.x + self_target.x * distance,
            y = self_current.y + self_target.y * distance,
            z = self_current.z + self_target.z * distance,
        }
        if alvo != nil then
            for _, obj in ipairs(alvo) do
                guardar(obj)
            end
            self.setPositionSmooth(pos)
        else
            self.setPositionSmooth(pos)
        end
        fechado = true
    end
end

function guardar(obj)
    local pos_original = obj.getPosition()
    local lock_check = obj.getLock()
    obj.setPosition({
        x = pos_original.x,
        y = pos_original.y-5000,
        z = pos_original.z
        })
    obj.setVar("Lock_Status", lock_check)
    obj.interactable = false
    obj.setLock(true)
end

function recuperar(obj)
    local pos_original = obj.getPosition()
    	local originalLockStatus = obj.getVar("Lock_Status")
    obj.setPosition({
        x = pos_original.x,
        y = pos_original.y+5000.6,
        z = pos_original.z
        })
        	
    obj.interactable = true
	
        	if originalLockStatus ~= nil and originalLockStatus == true then
            		obj.setLock(true)
        	else
            		obj.setLock(false)
        	end
end

function findInRadiusBy(pos, radius, func, debug)
    local radius = (radius or 1)
    local objList = Physics.cast({
        origin=pos, direction={0,1,0}, type=3, size={radius,4,radius},
        max_distance=0, debug=(debug or false)
    })

    local refinedList = {}
    for _, obj in ipairs(objList) do
        if func == nil then
            table.insert(refinedList, obj.hit_object)
        else
            if func(obj.hit_object) then
                table.insert(refinedList, obj.hit_object)
            end
        end
    end

    return refinedList
end

-- ===== Pink_Drawer c84f48 (3132 chars) =====
self.setName("Pink_Drawer")

function onload()
    self.interactable = false

    pos_uni = self.getPosition()
    eixo_z = pos_uni.z

    if eixo_z < 20 then
        fechado = true
    else
        fechado = false
    end

    self.createButton({
    label = "",
    tooltip = "Push/Pull",
    click_function = "clicado",
    function_owner = self,
    width = 960,
    height = 700,
    position = {0, 1, 9.5},
    rotation = {-90, 0, 0},
    color = {255,255,255,0}
    })
end

function clicado()
    if fechado then
        local distance = 15
        self_current = self.getPosition()
        self_target = self.getTransformForward()
        local pos = {
            x = self_current.x + self_target.x * distance,
            y = self_current.y + self_target.y * distance,
            z = self_current.z + self_target.z * distance,
        }
        if alvo != nil then
            self.setPositionSmooth(pos, true, true)
            for _, obj in ipairs(alvo) do
                recuperar(obj)
            end
        else
            self.setPositionSmooth(pos)
        end
        fechado = false
    
    else
        alvo = findInRadiusBy(self.getPosition(), 15)
        distance = -15
        self_current = self.getPosition()
        self_target = self.getTransformForward()
        pos = {
            x = self_current.x + self_target.x * distance,
            y = self_current.y + self_target.y * distance,
            z = self_current.z + self_target.z * distance,
        }
        if alvo != nil then
            for _, obj in ipairs(alvo) do
                guardar(obj)
            end
            self.setPositionSmooth(pos)
        else
            self.setPositionSmooth(pos)
        end
        fechado = true
    end
end

function guardar(obj)
    local pos_original = obj.getPosition()
    local lock_check = obj.getLock()
    obj.setPosition({
        x = pos_original.x,
        y = pos_original.y-5000,
        z = pos_original.z
        })
    obj.setVar("Lock_Status", lock_check)
    obj.interactable = false
    obj.setLock(true)
end

function recuperar(obj)
    local pos_original = obj.getPosition()
    	local originalLockStatus = obj.getVar("Lock_Status")
    obj.setPosition({
        x = pos_original.x,
        y = pos_original.y+5000.6,
        z = pos_original.z
        })
        	
    obj.interactable = true
	
        	if originalLockStatus ~= nil and originalLockStatus == true then
            		obj.setLock(true)
        	else
            		obj.setLock(false)
        	end
end

function findInRadiusBy(pos, radius, func, debug)
    local radius = (radius or 1)
    local objList = Physics.cast({
        origin=pos, direction={0,1,0}, type=3, size={radius,4,radius},
        max_distance=0, debug=(debug or false)
    })

    local refinedList = {}
    for _, obj in ipairs(objList) do
        if func == nil then
            table.insert(refinedList, obj.hit_object)
        else
            if func(obj.hit_object) then
                table.insert(refinedList, obj.hit_object)
            end
        end
    end

    return refinedList
end

-- ===== Foldspace b35dc2 (2132 chars) =====
function onLoad()
   self.clearButtons()
   self.createButton({
    ['click_function'] = 'trashConfirm',
    ['label'] = 'Trash the Card?',
    ['function_owner'] = self,
    ['position'] = {0, 0.2, 0.3},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 800,
    ['height'] = 200,
    ['scale'] = {0.9,0.9,0.9},
    ['font_size'] = 75,
    ['font_color'] = {1, 1, 1}
,
    ['color'] = {0,0,0}
   })
end

function trashConfirm()
   self.clearButtons()
   self.createButton({
    ['click_function'] = 'doNothing',
    ['label'] = 'Are You Sure?',
    ['function_owner'] = self,
    ['position'] = {0, 0.2, 0.3},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 800,
    ['height'] = 200,
    ['scale'] = {0.9,0.9,0.9},
    ['font_size'] = 75,
    ['font_color'] = {1, 1, 1}
,
    ['color'] = {0,0,0}
   })
   self.createButton({
    ['click_function'] = 'trashCard',
    ['label'] = 'Yes',
    ['function_owner'] = self,
    ['position'] = {-0.2, 0.2, 0.6},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 150,
    ['height'] = 100,
    ['scale'] = {0.9,0.9,0.9},
    ['font_size'] = 75,
    ['font_color'] = {1, 1, 1}
,
    ['color'] = "Green"
   })
   self.createButton({
    ['click_function'] = 'holdCard',
    ['label'] = 'No',
    ['function_owner'] = self,
    ['position'] = {0.2, 0.2, 0.6},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 150,
    ['height'] = 100,
    ['scale'] = {0.9,0.9,0.9},
    ['font_size'] = 75,
    ['font_color'] = {1, 1, 1}
,
    ['color'] = "Red"
   })
end

function holdCard()
   self.clearButtons()
   self.createButton({
    ['click_function'] = 'trashConfirm',
    ['label'] = 'Trash the Card?',
    ['function_owner'] = self,
    ['position'] = {0, 0.2, 0.3},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 800,
    ['height'] = 200,
    ['scale'] = {0.9,0.9,0.9},
    ['font_size'] = 75,
    ['font_color'] = {1, 1, 1}
,
    ['color'] = {0,0,0}
   })
end

function trashCard()
  self.clearButtons()
  getObjectFromGUID("288283").putObject(self)
  broadcastToAll("Card Trashed")
end

function doNothing()
end

-- ===== Foldspace e24cb1 (2132 chars) =====
function onLoad()
   self.clearButtons()
   self.createButton({
    ['click_function'] = 'trashConfirm',
    ['label'] = 'Trash the Card?',
    ['function_owner'] = self,
    ['position'] = {0, 0.2, 0.3},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 800,
    ['height'] = 200,
    ['scale'] = {0.9,0.9,0.9},
    ['font_size'] = 75,
    ['font_color'] = {1, 1, 1}
,
    ['color'] = {0,0,0}
   })
end

function trashConfirm()
   self.clearButtons()
   self.createButton({
    ['click_function'] = 'doNothing',
    ['label'] = 'Are You Sure?',
    ['function_owner'] = self,
    ['position'] = {0, 0.2, 0.3},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 800,
    ['height'] = 200,
    ['scale'] = {0.9,0.9,0.9},
    ['font_size'] = 75,
    ['font_color'] = {1, 1, 1}
,
    ['color'] = {0,0,0}
   })
   self.createButton({
    ['click_function'] = 'trashCard',
    ['label'] = 'Yes',
    ['function_owner'] = self,
    ['position'] = {-0.2, 0.2, 0.6},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 150,
    ['height'] = 100,
    ['scale'] = {0.9,0.9,0.9},
    ['font_size'] = 75,
    ['font_color'] = {1, 1, 1}
,
    ['color'] = "Green"
   })
   self.createButton({
    ['click_function'] = 'holdCard',
    ['label'] = 'No',
    ['function_owner'] = self,
    ['position'] = {0.2, 0.2, 0.6},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 150,
    ['height'] = 100,
    ['scale'] = {0.9,0.9,0.9},
    ['font_size'] = 75,
    ['font_color'] = {1, 1, 1}
,
    ['color'] = "Red"
   })
end

function holdCard()
   self.clearButtons()
   self.createButton({
    ['click_function'] = 'trashConfirm',
    ['label'] = 'Trash the Card?',
    ['function_owner'] = self,
    ['position'] = {0, 0.2, 0.3},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 800,
    ['height'] = 200,
    ['scale'] = {0.9,0.9,0.9},
    ['font_size'] = 75,
    ['font_color'] = {1, 1, 1}
,
    ['color'] = {0,0,0}
   })
end

function trashCard()
  self.clearButtons()
  getObjectFromGUID("288283").putObject(self)
  broadcastToAll("Card Trashed")
end

function doNothing()
end

-- ===== Foldspace 136a26 (2132 chars) =====
function onLoad()
   self.clearButtons()
   self.createButton({
    ['click_function'] = 'trashConfirm',
    ['label'] = 'Trash the Card?',
    ['function_owner'] = self,
    ['position'] = {0, 0.2, 0.3},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 800,
    ['height'] = 200,
    ['scale'] = {0.9,0.9,0.9},
    ['font_size'] = 75,
    ['font_color'] = {1, 1, 1}
,
    ['color'] = {0,0,0}
   })
end

function trashConfirm()
   self.clearButtons()
   self.createButton({
    ['click_function'] = 'doNothing',
    ['label'] = 'Are You Sure?',
    ['function_owner'] = self,
    ['position'] = {0, 0.2, 0.3},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 800,
    ['height'] = 200,
    ['scale'] = {0.9,0.9,0.9},
    ['font_size'] = 75,
    ['font_color'] = {1, 1, 1}
,
    ['color'] = {0,0,0}
   })
   self.createButton({
    ['click_function'] = 'trashCard',
    ['label'] = 'Yes',
    ['function_owner'] = self,
    ['position'] = {-0.2, 0.2, 0.6},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 150,
    ['height'] = 100,
    ['scale'] = {0.9,0.9,0.9},
    ['font_size'] = 75,
    ['font_color'] = {1, 1, 1}
,
    ['color'] = "Green"
   })
   self.createButton({
    ['click_function'] = 'holdCard',
    ['label'] = 'No',
    ['function_owner'] = self,
    ['position'] = {0.2, 0.2, 0.6},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 150,
    ['height'] = 100,
    ['scale'] = {0.9,0.9,0.9},
    ['font_size'] = 75,
    ['font_color'] = {1, 1, 1}
,
    ['color'] = "Red"
   })
end

function holdCard()
   self.clearButtons()
   self.createButton({
    ['click_function'] = 'trashConfirm',
    ['label'] = 'Trash the Card?',
    ['function_owner'] = self,
    ['position'] = {0, 0.2, 0.3},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 800,
    ['height'] = 200,
    ['scale'] = {0.9,0.9,0.9},
    ['font_size'] = 75,
    ['font_color'] = {1, 1, 1}
,
    ['color'] = {0,0,0}
   })
end

function trashCard()
  self.clearButtons()
  getObjectFromGUID("288283").putObject(self)
  broadcastToAll("Card Trashed")
end

function doNothing()
end

-- ===== Foldspace f03caa (2132 chars) =====
function onLoad()
   self.clearButtons()
   self.createButton({
    ['click_function'] = 'trashConfirm',
    ['label'] = 'Trash the Card?',
    ['function_owner'] = self,
    ['position'] = {0, 0.2, 0.3},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 800,
    ['height'] = 200,
    ['scale'] = {0.9,0.9,0.9},
    ['font_size'] = 75,
    ['font_color'] = {1, 1, 1}
,
    ['color'] = {0,0,0}
   })
end

function trashConfirm()
   self.clearButtons()
   self.createButton({
    ['click_function'] = 'doNothing',
    ['label'] = 'Are You Sure?',
    ['function_owner'] = self,
    ['position'] = {0, 0.2, 0.3},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 800,
    ['height'] = 200,
    ['scale'] = {0.9,0.9,0.9},
    ['font_size'] = 75,
    ['font_color'] = {1, 1, 1}
,
    ['color'] = {0,0,0}
   })
   self.createButton({
    ['click_function'] = 'trashCard',
    ['label'] = 'Yes',
    ['function_owner'] = self,
    ['position'] = {-0.2, 0.2, 0.6},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 150,
    ['height'] = 100,
    ['scale'] = {0.9,0.9,0.9},
    ['font_size'] = 75,
    ['font_color'] = {1, 1, 1}
,
    ['color'] = "Green"
   })
   self.createButton({
    ['click_function'] = 'holdCard',
    ['label'] = 'No',
    ['function_owner'] = self,
    ['position'] = {0.2, 0.2, 0.6},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 150,
    ['height'] = 100,
    ['scale'] = {0.9,0.9,0.9},
    ['font_size'] = 75,
    ['font_color'] = {1, 1, 1}
,
    ['color'] = "Red"
   })
end

function holdCard()
   self.clearButtons()
   self.createButton({
    ['click_function'] = 'trashConfirm',
    ['label'] = 'Trash the Card?',
    ['function_owner'] = self,
    ['position'] = {0, 0.2, 0.3},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 800,
    ['height'] = 200,
    ['scale'] = {0.9,0.9,0.9},
    ['font_size'] = 75,
    ['font_color'] = {1, 1, 1}
,
    ['color'] = {0,0,0}
   })
end

function trashCard()
  self.clearButtons()
  getObjectFromGUID("288283").putObject(self)
  broadcastToAll("Card Trashed")
end

function doNothing()
end

-- ===== Foldspace 45d712 (2132 chars) =====
function onLoad()
   self.clearButtons()
   self.createButton({
    ['click_function'] = 'trashConfirm',
    ['label'] = 'Trash the Card?',
    ['function_owner'] = self,
    ['position'] = {0, 0.2, 0.3},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 800,
    ['height'] = 200,
    ['scale'] = {0.9,0.9,0.9},
    ['font_size'] = 75,
    ['font_color'] = {1, 1, 1}
,
    ['color'] = {0,0,0}
   })
end

function trashConfirm()
   self.clearButtons()
   self.createButton({
    ['click_function'] = 'doNothing',
    ['label'] = 'Are You Sure?',
    ['function_owner'] = self,
    ['position'] = {0, 0.2, 0.3},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 800,
    ['height'] = 200,
    ['scale'] = {0.9,0.9,0.9},
    ['font_size'] = 75,
    ['font_color'] = {1, 1, 1}
,
    ['color'] = {0,0,0}
   })
   self.createButton({
    ['click_function'] = 'trashCard',
    ['label'] = 'Yes',
    ['function_owner'] = self,
    ['position'] = {-0.2, 0.2, 0.6},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 150,
    ['height'] = 100,
    ['scale'] = {0.9,0.9,0.9},
    ['font_size'] = 75,
    ['font_color'] = {1, 1, 1}
,
    ['color'] = "Green"
   })
   self.createButton({
    ['click_function'] = 'holdCard',
    ['label'] = 'No',
    ['function_owner'] = self,
    ['position'] = {0.2, 0.2, 0.6},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 150,
    ['height'] = 100,
    ['scale'] = {0.9,0.9,0.9},
    ['font_size'] = 75,
    ['font_color'] = {1, 1, 1}
,
    ['color'] = "Red"
   })
end

function holdCard()
   self.clearButtons()
   self.createButton({
    ['click_function'] = 'trashConfirm',
    ['label'] = 'Trash the Card?',
    ['function_owner'] = self,
    ['position'] = {0, 0.2, 0.3},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 800,
    ['height'] = 200,
    ['scale'] = {0.9,0.9,0.9},
    ['font_size'] = 75,
    ['font_color'] = {1, 1, 1}
,
    ['color'] = {0,0,0}
   })
end

function trashCard()
  self.clearButtons()
  getObjectFromGUID("288283").putObject(self)
  broadcastToAll("Card Trashed")
end

function doNothing()
end

-- ===== Foldspace 51695e (2132 chars) =====
function onLoad()
   self.clearButtons()
   self.createButton({
    ['click_function'] = 'trashConfirm',
    ['label'] = 'Trash the Card?',
    ['function_owner'] = self,
    ['position'] = {0, 0.2, 0.3},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 800,
    ['height'] = 200,
    ['scale'] = {0.9,0.9,0.9},
    ['font_size'] = 75,
    ['font_color'] = {1, 1, 1}
,
    ['color'] = {0,0,0}
   })
end

function trashConfirm()
   self.clearButtons()
   self.createButton({
    ['click_function'] = 'doNothing',
    ['label'] = 'Are You Sure?',
    ['function_owner'] = self,
    ['position'] = {0, 0.2, 0.3},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 800,
    ['height'] = 200,
    ['scale'] = {0.9,0.9,0.9},
    ['font_size'] = 75,
    ['font_color'] = {1, 1, 1}
,
    ['color'] = {0,0,0}
   })
   self.createButton({
    ['click_function'] = 'trashCard',
    ['label'] = 'Yes',
    ['function_owner'] = self,
    ['position'] = {-0.2, 0.2, 0.6},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 150,
    ['height'] = 100,
    ['scale'] = {0.9,0.9,0.9},
    ['font_size'] = 75,
    ['font_color'] = {1, 1, 1}
,
    ['color'] = "Green"
   })
   self.createButton({
    ['click_function'] = 'holdCard',
    ['label'] = 'No',
    ['function_owner'] = self,
    ['position'] = {0.2, 0.2, 0.6},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 150,
    ['height'] = 100,
    ['scale'] = {0.9,0.9,0.9},
    ['font_size'] = 75,
    ['font_color'] = {1, 1, 1}
,
    ['color'] = "Red"
   })
end

function holdCard()
   self.clearButtons()
   self.createButton({
    ['click_function'] = 'trashConfirm',
    ['label'] = 'Trash the Card?',
    ['function_owner'] = self,
    ['position'] = {0, 0.2, 0.3},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 800,
    ['height'] = 200,
    ['scale'] = {0.9,0.9,0.9},
    ['font_size'] = 75,
    ['font_color'] = {1, 1, 1}
,
    ['color'] = {0,0,0}
   })
end

function trashCard()
  self.clearButtons()
  getObjectFromGUID("288283").putObject(self)
  broadcastToAll("Card Trashed")
end

function doNothing()
end

-- ===== Custom_Tile 312109 (1647 chars) =====
playerBoard = {"bd39f6", "9b4f33", "bd5bf6", "231215"}
locationZone = "2cb52b"

function onLoad()
  self.clearButtons()
  self.createButton ({
    ['click_function'] = 'placeAgent',
    ['label'] = 'Send Agent',
    ['function_owner'] = self,
    ['position'] = {0, 0.1, 0.0},
    ['rotation'] =  {0, 0, 0},
    ['scale'] = {1.0,1.0,1.0},
    ['width'] = 3600,
    ['height'] = 800,
    ['font_size'] = 550,
    ['color'] = {0,0,0},
    ['font_color'] = "White"
  })
end

function placeAgent(GO, color)
  local playerZone = 0
  local playerItems = {}
  local agentPos = getObjectFromGUID(locationZone).getPosition()
  
  agentPos.y = agentPos.y + 0.5

  if color == "Red" then
    playerZone = 1
  elseif color == "Blue" then
    playerZone = 2
  elseif color == "Orange" then
    playerZone = 3
  elseif color == "Green" then
    playerZone = 4
  end

  local agentPresence = 0
  local locationItems = getObjectFromGUID(locationZone).getObjects()

  for _, obj in ipairs(locationItems) do
    if obj.getDescription() == "Agent" then
      agentPresence = 1
    end
  end

  playerItems = getObjectFromGUID(playerBoard[playerZone]).getObjects()

  local agentCheck = 0

  if agentPresence == 0 then
   for _, item in ipairs(playerItems) do
    if item.getDescription() == "Agent" then
      item.setPositionSmooth(agentPos, false,true)
      agentCheck = 1
      break
    end
   end
  elseif agentPresence == 1 then
    broadcastToAll("Agent Already Present at this Location")
  end

  if agentCheck == 0 and agentPresence == 0 then
    broadcastToAll(color .. " Player has no Agents Available to Send", stringColorToRGB(color))
  end

end

-- ===== Custom_Tile ca20ba (1647 chars) =====
playerBoard = {"bd39f6", "9b4f33", "bd5bf6", "231215"}
locationZone = "139415"

function onLoad()
  self.clearButtons()
  self.createButton ({
    ['click_function'] = 'placeAgent',
    ['label'] = 'Send Agent',
    ['function_owner'] = self,
    ['position'] = {0, 0.1, 0.0},
    ['rotation'] =  {0, 0, 0},
    ['scale'] = {1.0,1.0,1.0},
    ['width'] = 3600,
    ['height'] = 800,
    ['font_size'] = 550,
    ['color'] = {0,0,0},
    ['font_color'] = "White"
  })
end

function placeAgent(GO, color)
  local playerZone = 0
  local playerItems = {}
  local agentPos = getObjectFromGUID(locationZone).getPosition()
  
  agentPos.y = agentPos.y + 0.5

  if color == "Red" then
    playerZone = 1
  elseif color == "Blue" then
    playerZone = 2
  elseif color == "Orange" then
    playerZone = 3
  elseif color == "Green" then
    playerZone = 4
  end

  local agentPresence = 0
  local locationItems = getObjectFromGUID(locationZone).getObjects()

  for _, obj in ipairs(locationItems) do
    if obj.getDescription() == "Agent" then
      agentPresence = 1
    end
  end

  playerItems = getObjectFromGUID(playerBoard[playerZone]).getObjects()

  local agentCheck = 0

  if agentPresence == 0 then
   for _, item in ipairs(playerItems) do
    if item.getDescription() == "Agent" then
      item.setPositionSmooth(agentPos, false,true)
      agentCheck = 1
      break
    end
   end
  elseif agentPresence == 1 then
    broadcastToAll("Agent Already Present at this Location")
  end

  if agentCheck == 0 and agentPresence == 0 then
    broadcastToAll(color .. " Player has no Agents Available to Send", stringColorToRGB(color))
  end

end

-- ===== Custom_Tile 438a60 (1647 chars) =====
playerBoard = {"bd39f6", "9b4f33", "bd5bf6", "231215"}
locationZone = "7872cc"

function onLoad()
  self.clearButtons()
  self.createButton ({
    ['click_function'] = 'placeAgent',
    ['label'] = 'Send Agent',
    ['function_owner'] = self,
    ['position'] = {0, 0.1, 0.0},
    ['rotation'] =  {0, 0, 0},
    ['scale'] = {1.0,1.0,1.0},
    ['width'] = 3600,
    ['height'] = 800,
    ['font_size'] = 550,
    ['color'] = {0,0,0},
    ['font_color'] = "White"
  })
end

function placeAgent(GO, color)
  local playerZone = 0
  local playerItems = {}
  local agentPos = getObjectFromGUID(locationZone).getPosition()
  
  agentPos.y = agentPos.y + 0.5

  if color == "Red" then
    playerZone = 1
  elseif color == "Blue" then
    playerZone = 2
  elseif color == "Orange" then
    playerZone = 3
  elseif color == "Green" then
    playerZone = 4
  end

  local agentPresence = 0
  local locationItems = getObjectFromGUID(locationZone).getObjects()

  for _, obj in ipairs(locationItems) do
    if obj.getDescription() == "Agent" then
      agentPresence = 1
    end
  end

  playerItems = getObjectFromGUID(playerBoard[playerZone]).getObjects()

  local agentCheck = 0

  if agentPresence == 0 then
   for _, item in ipairs(playerItems) do
    if item.getDescription() == "Agent" then
      item.setPositionSmooth(agentPos, false,true)
      agentCheck = 1
      break
    end
   end
  elseif agentPresence == 1 then
    broadcastToAll("Agent Already Present at this Location")
  end

  if agentCheck == 0 and agentPresence == 0 then
    broadcastToAll(color .. " Player has no Agents Available to Send", stringColorToRGB(color))
  end

end

-- ===== Custom_Tile 1fb1b0 (1647 chars) =====
playerBoard = {"bd39f6", "9b4f33", "bd5bf6", "231215"}
locationZone = "3766cc"

function onLoad()
  self.clearButtons()
  self.createButton ({
    ['click_function'] = 'placeAgent',
    ['label'] = 'Send Agent',
    ['function_owner'] = self,
    ['position'] = {0, 0.1, 0.0},
    ['rotation'] =  {0, 0, 0},
    ['scale'] = {1.0,1.0,1.0},
    ['width'] = 3600,
    ['height'] = 800,
    ['font_size'] = 550,
    ['color'] = {0,0,0},
    ['font_color'] = "White"
  })
end

function placeAgent(GO, color)
  local playerZone = 0
  local playerItems = {}
  local agentPos = getObjectFromGUID(locationZone).getPosition()
  
  agentPos.y = agentPos.y + 0.5

  if color == "Red" then
    playerZone = 1
  elseif color == "Blue" then
    playerZone = 2
  elseif color == "Orange" then
    playerZone = 3
  elseif color == "Green" then
    playerZone = 4
  end

  local agentPresence = 0
  local locationItems = getObjectFromGUID(locationZone).getObjects()

  for _, obj in ipairs(locationItems) do
    if obj.getDescription() == "Agent" then
      agentPresence = 1
    end
  end

  playerItems = getObjectFromGUID(playerBoard[playerZone]).getObjects()

  local agentCheck = 0

  if agentPresence == 0 then
   for _, item in ipairs(playerItems) do
    if item.getDescription() == "Agent" then
      item.setPositionSmooth(agentPos, false,true)
      agentCheck = 1
      break
    end
   end
  elseif agentPresence == 1 then
    broadcastToAll("Agent Already Present at this Location")
  end

  if agentCheck == 0 and agentPresence == 0 then
    broadcastToAll(color .. " Player has no Agents Available to Send", stringColorToRGB(color))
  end

end

-- ===== Custom_Tile 2a9190 (1647 chars) =====
playerBoard = {"bd39f6", "9b4f33", "bd5bf6", "231215"}
locationZone = "060b9a"

function onLoad()
  self.clearButtons()
  self.createButton ({
    ['click_function'] = 'placeAgent',
    ['label'] = 'Send Agent',
    ['function_owner'] = self,
    ['position'] = {0, 0.1, 0.0},
    ['rotation'] =  {0, 0, 0},
    ['scale'] = {1.0,1.0,1.0},
    ['width'] = 3600,
    ['height'] = 800,
    ['font_size'] = 550,
    ['color'] = {0,0,0},
    ['font_color'] = "White"
  })
end

function placeAgent(GO, color)
  local playerZone = 0
  local playerItems = {}
  local agentPos = getObjectFromGUID(locationZone).getPosition()
  
  agentPos.y = agentPos.y + 0.5

  if color == "Red" then
    playerZone = 1
  elseif color == "Blue" then
    playerZone = 2
  elseif color == "Orange" then
    playerZone = 3
  elseif color == "Green" then
    playerZone = 4
  end

  local agentPresence = 0
  local locationItems = getObjectFromGUID(locationZone).getObjects()

  for _, obj in ipairs(locationItems) do
    if obj.getDescription() == "Agent" then
      agentPresence = 1
    end
  end

  playerItems = getObjectFromGUID(playerBoard[playerZone]).getObjects()

  local agentCheck = 0

  if agentPresence == 0 then
   for _, item in ipairs(playerItems) do
    if item.getDescription() == "Agent" then
      item.setPositionSmooth(agentPos, false,true)
      agentCheck = 1
      break
    end
   end
  elseif agentPresence == 1 then
    broadcastToAll("Agent Already Present at this Location")
  end

  if agentCheck == 0 and agentPresence == 0 then
    broadcastToAll(color .. " Player has no Agents Available to Send", stringColorToRGB(color))
  end

end

-- ===== Custom_Tile ea0cff (1647 chars) =====
playerBoard = {"bd39f6", "9b4f33", "bd5bf6", "231215"}
locationZone = "bf7c66"

function onLoad()
  self.clearButtons()
  self.createButton ({
    ['click_function'] = 'placeAgent',
    ['label'] = 'Send Agent',
    ['function_owner'] = self,
    ['position'] = {0, 0.1, 0.0},
    ['rotation'] =  {0, 0, 0},
    ['scale'] = {1.0,1.0,1.0},
    ['width'] = 3600,
    ['height'] = 800,
    ['font_size'] = 550,
    ['color'] = {0,0,0},
    ['font_color'] = "White"
  })
end

function placeAgent(GO, color)
  local playerZone = 0
  local playerItems = {}
  local agentPos = getObjectFromGUID(locationZone).getPosition()
  
  agentPos.y = agentPos.y + 0.5

  if color == "Red" then
    playerZone = 1
  elseif color == "Blue" then
    playerZone = 2
  elseif color == "Orange" then
    playerZone = 3
  elseif color == "Green" then
    playerZone = 4
  end

  local agentPresence = 0
  local locationItems = getObjectFromGUID(locationZone).getObjects()

  for _, obj in ipairs(locationItems) do
    if obj.getDescription() == "Agent" then
      agentPresence = 1
    end
  end

  playerItems = getObjectFromGUID(playerBoard[playerZone]).getObjects()

  local agentCheck = 0

  if agentPresence == 0 then
   for _, item in ipairs(playerItems) do
    if item.getDescription() == "Agent" then
      item.setPositionSmooth(agentPos, false,true)
      agentCheck = 1
      break
    end
   end
  elseif agentPresence == 1 then
    broadcastToAll("Agent Already Present at this Location")
  end

  if agentCheck == 0 and agentPresence == 0 then
    broadcastToAll(color .. " Player has no Agents Available to Send", stringColorToRGB(color))
  end

end

-- ===== Custom_Tile 17aa61 (1647 chars) =====
playerBoard = {"bd39f6", "9b4f33", "bd5bf6", "231215"}
locationZone = "a8f11b"

function onLoad()
  self.clearButtons()
  self.createButton ({
    ['click_function'] = 'placeAgent',
    ['label'] = 'Send Agent',
    ['function_owner'] = self,
    ['position'] = {0, 0.1, 0.0},
    ['rotation'] =  {0, 0, 0},
    ['scale'] = {1.0,1.0,1.0},
    ['width'] = 3600,
    ['height'] = 800,
    ['font_size'] = 550,
    ['color'] = {0,0,0},
    ['font_color'] = "White"
  })
end

function placeAgent(GO, color)
  local playerZone = 0
  local playerItems = {}
  local agentPos = getObjectFromGUID(locationZone).getPosition()
  
  agentPos.y = agentPos.y + 0.5

  if color == "Red" then
    playerZone = 1
  elseif color == "Blue" then
    playerZone = 2
  elseif color == "Orange" then
    playerZone = 3
  elseif color == "Green" then
    playerZone = 4
  end

  local agentPresence = 0
  local locationItems = getObjectFromGUID(locationZone).getObjects()

  for _, obj in ipairs(locationItems) do
    if obj.getDescription() == "Agent" then
      agentPresence = 1
    end
  end

  playerItems = getObjectFromGUID(playerBoard[playerZone]).getObjects()

  local agentCheck = 0

  if agentPresence == 0 then
   for _, item in ipairs(playerItems) do
    if item.getDescription() == "Agent" then
      item.setPositionSmooth(agentPos, false,true)
      agentCheck = 1
      break
    end
   end
  elseif agentPresence == 1 then
    broadcastToAll("Agent Already Present at this Location")
  end

  if agentCheck == 0 and agentPresence == 0 then
    broadcastToAll(color .. " Player has no Agents Available to Send", stringColorToRGB(color))
  end

end

-- ===== Custom_Tile 9375b7 (1647 chars) =====
playerBoard = {"bd39f6", "9b4f33", "bd5bf6", "231215"}
locationZone = "cfb1c9"

function onLoad()
  self.clearButtons()
  self.createButton ({
    ['click_function'] = 'placeAgent',
    ['label'] = 'Send Agent',
    ['function_owner'] = self,
    ['position'] = {0, 0.1, 0.0},
    ['rotation'] =  {0, 0, 0},
    ['scale'] = {1.0,1.0,1.0},
    ['width'] = 3600,
    ['height'] = 800,
    ['font_size'] = 550,
    ['color'] = {0,0,0},
    ['font_color'] = "White"
  })
end

function placeAgent(GO, color)
  local playerZone = 0
  local playerItems = {}
  local agentPos = getObjectFromGUID(locationZone).getPosition()
  
  agentPos.y = agentPos.y + 0.5

  if color == "Red" then
    playerZone = 1
  elseif color == "Blue" then
    playerZone = 2
  elseif color == "Orange" then
    playerZone = 3
  elseif color == "Green" then
    playerZone = 4
  end

  local agentPresence = 0
  local locationItems = getObjectFromGUID(locationZone).getObjects()

  for _, obj in ipairs(locationItems) do
    if obj.getDescription() == "Agent" then
      agentPresence = 1
    end
  end

  playerItems = getObjectFromGUID(playerBoard[playerZone]).getObjects()

  local agentCheck = 0

  if agentPresence == 0 then
   for _, item in ipairs(playerItems) do
    if item.getDescription() == "Agent" then
      item.setPositionSmooth(agentPos, false,true)
      agentCheck = 1
      break
    end
   end
  elseif agentPresence == 1 then
    broadcastToAll("Agent Already Present at this Location")
  end

  if agentCheck == 0 and agentPresence == 0 then
    broadcastToAll(color .. " Player has no Agents Available to Send", stringColorToRGB(color))
  end

end

-- ===== Custom_Tile 410533 (1647 chars) =====
playerBoard = {"bd39f6", "9b4f33", "bd5bf6", "231215"}
locationZone = "64f5b6"

function onLoad()
  self.clearButtons()
  self.createButton ({
    ['click_function'] = 'placeAgent',
    ['label'] = 'Send Agent',
    ['function_owner'] = self,
    ['position'] = {0, 0.1, 0.0},
    ['rotation'] =  {0, 0, 0},
    ['scale'] = {1.0,1.0,1.0},
    ['width'] = 3600,
    ['height'] = 800,
    ['font_size'] = 550,
    ['color'] = {0,0,0},
    ['font_color'] = "White"
  })
end

function placeAgent(GO, color)
  local playerZone = 0
  local playerItems = {}
  local agentPos = getObjectFromGUID(locationZone).getPosition()
  
  agentPos.y = agentPos.y + 0.5

  if color == "Red" then
    playerZone = 1
  elseif color == "Blue" then
    playerZone = 2
  elseif color == "Orange" then
    playerZone = 3
  elseif color == "Green" then
    playerZone = 4
  end

  local agentPresence = 0
  local locationItems = getObjectFromGUID(locationZone).getObjects()

  for _, obj in ipairs(locationItems) do
    if obj.getDescription() == "Agent" then
      agentPresence = 1
    end
  end

  playerItems = getObjectFromGUID(playerBoard[playerZone]).getObjects()

  local agentCheck = 0

  if agentPresence == 0 then
   for _, item in ipairs(playerItems) do
    if item.getDescription() == "Agent" then
      item.setPositionSmooth(agentPos, false,true)
      agentCheck = 1
      break
    end
   end
  elseif agentPresence == 1 then
    broadcastToAll("Agent Already Present at this Location")
  end

  if agentCheck == 0 and agentPresence == 0 then
    broadcastToAll(color .. " Player has no Agents Available to Send", stringColorToRGB(color))
  end

end

-- ===== Custom_Tile bceb8c (1647 chars) =====
playerBoard = {"bd39f6", "9b4f33", "bd5bf6", "231215"}
locationZone = "7b1013"

function onLoad()
  self.clearButtons()
  self.createButton ({
    ['click_function'] = 'placeAgent',
    ['label'] = 'Send Agent',
    ['function_owner'] = self,
    ['position'] = {0, 0.1, 0.0},
    ['rotation'] =  {0, 0, 0},
    ['scale'] = {1.0,1.0,1.0},
    ['width'] = 3600,
    ['height'] = 800,
    ['font_size'] = 550,
    ['color'] = {0,0,0},
    ['font_color'] = "White"
  })
end

function placeAgent(GO, color)
  local playerZone = 0
  local playerItems = {}
  local agentPos = getObjectFromGUID(locationZone).getPosition()
  
  agentPos.y = agentPos.y + 0.5

  if color == "Red" then
    playerZone = 1
  elseif color == "Blue" then
    playerZone = 2
  elseif color == "Orange" then
    playerZone = 3
  elseif color == "Green" then
    playerZone = 4
  end

  local agentPresence = 0
  local locationItems = getObjectFromGUID(locationZone).getObjects()

  for _, obj in ipairs(locationItems) do
    if obj.getDescription() == "Agent" then
      agentPresence = 1
    end
  end

  playerItems = getObjectFromGUID(playerBoard[playerZone]).getObjects()

  local agentCheck = 0

  if agentPresence == 0 then
   for _, item in ipairs(playerItems) do
    if item.getDescription() == "Agent" then
      item.setPositionSmooth(agentPos, false,true)
      agentCheck = 1
      break
    end
   end
  elseif agentPresence == 1 then
    broadcastToAll("Agent Already Present at this Location")
  end

  if agentCheck == 0 and agentPresence == 0 then
    broadcastToAll(color .. " Player has no Agents Available to Send", stringColorToRGB(color))
  end

end

-- ===== Custom_Tile 278d1b (1647 chars) =====
playerBoard = {"bd39f6", "9b4f33", "bd5bf6", "231215"}
locationZone = "9c5484"

function onLoad()
  self.clearButtons()
  self.createButton ({
    ['click_function'] = 'placeAgent',
    ['label'] = 'Send Agent',
    ['function_owner'] = self,
    ['position'] = {0, 0.1, 0.0},
    ['rotation'] =  {0, 0, 0},
    ['scale'] = {1.0,1.0,1.0},
    ['width'] = 3600,
    ['height'] = 800,
    ['font_size'] = 550,
    ['color'] = {0,0,0},
    ['font_color'] = "White"
  })
end

function placeAgent(GO, color)
  local playerZone = 0
  local playerItems = {}
  local agentPos = getObjectFromGUID(locationZone).getPosition()
  
  agentPos.y = agentPos.y + 0.5

  if color == "Red" then
    playerZone = 1
  elseif color == "Blue" then
    playerZone = 2
  elseif color == "Orange" then
    playerZone = 3
  elseif color == "Green" then
    playerZone = 4
  end

  local agentPresence = 0
  local locationItems = getObjectFromGUID(locationZone).getObjects()

  for _, obj in ipairs(locationItems) do
    if obj.getDescription() == "Agent" then
      agentPresence = 1
    end
  end

  playerItems = getObjectFromGUID(playerBoard[playerZone]).getObjects()

  local agentCheck = 0

  if agentPresence == 0 then
   for _, item in ipairs(playerItems) do
    if item.getDescription() == "Agent" then
      item.setPositionSmooth(agentPos, false,true)
      agentCheck = 1
      break
    end
   end
  elseif agentPresence == 1 then
    broadcastToAll("Agent Already Present at this Location")
  end

  if agentCheck == 0 and agentPresence == 0 then
    broadcastToAll(color .. " Player has no Agents Available to Send", stringColorToRGB(color))
  end

end

-- ===== Custom_Tile 0227ac (1647 chars) =====
playerBoard = {"bd39f6", "9b4f33", "bd5bf6", "231215"}
locationZone = "84b048"

function onLoad()
  self.clearButtons()
  self.createButton ({
    ['click_function'] = 'placeAgent',
    ['label'] = 'Send Agent',
    ['function_owner'] = self,
    ['position'] = {0, 0.1, 0.0},
    ['rotation'] =  {0, 0, 0},
    ['scale'] = {1.0,1.0,1.0},
    ['width'] = 3600,
    ['height'] = 800,
    ['font_size'] = 550,
    ['color'] = {0,0,0},
    ['font_color'] = "White"
  })
end

function placeAgent(GO, color)
  local playerZone = 0
  local playerItems = {}
  local agentPos = getObjectFromGUID(locationZone).getPosition()
  
  agentPos.y = agentPos.y + 0.5

  if color == "Red" then
    playerZone = 1
  elseif color == "Blue" then
    playerZone = 2
  elseif color == "Orange" then
    playerZone = 3
  elseif color == "Green" then
    playerZone = 4
  end

  local agentPresence = 0
  local locationItems = getObjectFromGUID(locationZone).getObjects()

  for _, obj in ipairs(locationItems) do
    if obj.getDescription() == "Agent" then
      agentPresence = 1
    end
  end

  playerItems = getObjectFromGUID(playerBoard[playerZone]).getObjects()

  local agentCheck = 0

  if agentPresence == 0 then
   for _, item in ipairs(playerItems) do
    if item.getDescription() == "Agent" then
      item.setPositionSmooth(agentPos, false,true)
      agentCheck = 1
      break
    end
   end
  elseif agentPresence == 1 then
    broadcastToAll("Agent Already Present at this Location")
  end

  if agentCheck == 0 and agentPresence == 0 then
    broadcastToAll(color .. " Player has no Agents Available to Send", stringColorToRGB(color))
  end

end

-- ===== Custom_Tile 3d8ded (1647 chars) =====
playerBoard = {"bd39f6", "9b4f33", "bd5bf6", "231215"}
locationZone = "6e0a33"

function onLoad()
  self.clearButtons()
  self.createButton ({
    ['click_function'] = 'placeAgent',
    ['label'] = 'Send Agent',
    ['function_owner'] = self,
    ['position'] = {0, 0.1, 0.0},
    ['rotation'] =  {0, 0, 0},
    ['scale'] = {1.0,1.0,1.0},
    ['width'] = 3600,
    ['height'] = 800,
    ['font_size'] = 550,
    ['color'] = {0,0,0},
    ['font_color'] = "White"
  })
end

function placeAgent(GO, color)
  local playerZone = 0
  local playerItems = {}
  local agentPos = getObjectFromGUID(locationZone).getPosition()
  
  agentPos.y = agentPos.y + 0.5

  if color == "Red" then
    playerZone = 1
  elseif color == "Blue" then
    playerZone = 2
  elseif color == "Orange" then
    playerZone = 3
  elseif color == "Green" then
    playerZone = 4
  end

  local agentPresence = 0
  local locationItems = getObjectFromGUID(locationZone).getObjects()

  for _, obj in ipairs(locationItems) do
    if obj.getDescription() == "Agent" then
      agentPresence = 1
    end
  end

  playerItems = getObjectFromGUID(playerBoard[playerZone]).getObjects()

  local agentCheck = 0

  if agentPresence == 0 then
   for _, item in ipairs(playerItems) do
    if item.getDescription() == "Agent" then
      item.setPositionSmooth(agentPos, false,true)
      agentCheck = 1
      break
    end
   end
  elseif agentPresence == 1 then
    broadcastToAll("Agent Already Present at this Location")
  end

  if agentCheck == 0 and agentPresence == 0 then
    broadcastToAll(color .. " Player has no Agents Available to Send", stringColorToRGB(color))
  end

end

-- ===== Custom_Tile 3d34e0 (2707 chars) =====
playerBoard = {"bd39f6", "9b4f33", "bd5bf6", "231215"}
councilorTokens = {"f19a48", "f5b14a", "5dd080", "a0028d"}

locationZone = "913070"

function onLoad()
  self.clearButtons()
  self.createButton ({
    ['click_function'] = 'placeAgent',
    ['label'] = 'Send Agent',
    ['function_owner'] = self,
    ['position'] = {0, 0.1, 0.0},
    ['rotation'] =  {0, 0, 0},
    ['scale'] = {1.0,1.0,1.0},
    ['width'] = 3600,
    ['height'] = 800,
    ['font_size'] = 550,
    ['color'] = {0,0,0},
    ['font_color'] = "White"
  })
end

function placeAgent(GO, color)
  local playerZone = 0
  local playerItems = {}
  local agentPos = getObjectFromGUID(locationZone).getPosition()
  
  agentPos.y = agentPos.y + 0.5

  if color == "Red" then
    playerZone = 1
  elseif color == "Blue" then
    playerZone = 2
  elseif color == "Orange" then
    playerZone = 3
  elseif color == "Green" then
    playerZone = 4
  end

  local agentPresence = 0
  local locationItems = getObjectFromGUID(locationZone).getObjects()

  for _, obj in ipairs(locationItems) do
    if obj.getDescription() == "Agent" then
      agentPresence = 1
    end
  end

  playerItems = getObjectFromGUID(playerBoard[playerZone]).getObjects()
  bonusTokens = getObjectFromGUID("12120b").getObjects()

  local bonusToken = ""
  for _, bonusItem in ipairs(bonusTokens) do
    if bonusItem.getName() == "Councilor Bonus" then
      bonusToken = bonusItem
      break
    end
  end

  local agentCheck = 0
  local placementCheck = getObjectFromGUID(councilorTokens[playerZone]).getPosition()

  local voiceCheck = 0
  local voiceQuery = getObjectFromGUID("913070").getObjects()
    for _, itemQ in ipairs(voiceQuery) do
      if itemQ.getName() == "Voice Token" then
        voiceCheck = 1  
      end
    end
  if voiceCheck == 0 then

  if agentPresence == 0 then
   for _, item in ipairs(playerItems) do
    if item.getDescription() == "Agent" then
      item.setPositionSmooth(agentPos, false,true)
      if bonusToken != "" and round(placementCheck.z,2) != 14.08 then
        local bonusPos = bonusToken.getPosition()
        bonusPos.y = 1.5
        getObjectFromGUID(councilorTokens[playerZone]).setPositionSmooth(bonusPos, false, true)
      end
      agentCheck = 1
      break
    end
   end
  elseif agentPresence == 1 then
    broadcastToAll("Agent Already Present at this Location")
  end

  else
    broadcastToAll("Blocked by The Voice!")
  end

  if voiceCheck == 0 and agentCheck == 0 and agentPresence == 0 then
    broadcastToAll(color .. " Player has no Agents Available to Send", stringColorToRGB(color))
  end
end

function round(num, dec)
  local mult = 10^(dec or 0)
  return math.floor(num * mult + 0.5) / mult
end

-- ===== Custom_Tile 45df71 (3296 chars) =====
defaultColorList = {"Red", "Blue", "Orange", "Green"}
vpIncrease = {"upRed", "upBlue", "upOrange", "upGreen"} 
influenceZone = "75ce34"

playerBoard = {"bd39f6", "9b4f33", "bd5bf6", "231215"}
locationZone = "d526ea"

function onLoad()
  self.clearButtons()
  self.createButton ({
    ['click_function'] = 'placeAgent',
    ['label'] = 'Send Agent',
    ['function_owner'] = self,
    ['position'] = {0, 0.1, 0.0},
    ['rotation'] =  {0, 0, 0},
    ['scale'] = {1.0,1.0,1.0},
    ['width'] = 3600,
    ['height'] = 800,
    ['font_size'] = 550,
    ['color'] = {0,0,0},
    ['font_color'] = "White"
  })
end

function placeAgent(GO, color)
  local playerZone = 0
  local playerItems = {}
  local agentPos = getObjectFromGUID(locationZone).getPosition()
  
  agentPos.y = agentPos.y + 0.5

  if color == "Red" then
    playerZone = 1
  elseif color == "Blue" then
    playerZone = 2
  elseif color == "Orange" then
    playerZone = 3
  elseif color == "Green" then
    playerZone = 4
  end

  local agentPresence = 0
  local locationItems = getObjectFromGUID(locationZone).getObjects()

  for _, obj in ipairs(locationItems) do
    if obj.getDescription() == "Agent" then
      agentPresence = 1
    end
  end

  playerItems = getObjectFromGUID(playerBoard[playerZone]).getObjects()

  local agentCheck = 0
  local voiceCheck = 0
  local voiceQuery = getObjectFromGUID("d526ea").getObjects()
    for _, itemQ in ipairs(voiceQuery) do
      if itemQ.getName() == "Voice Token" then
        voiceCheck = 1  
      end
    end
  if voiceCheck == 0 then

  if agentPresence == 0 then
   for _, item in ipairs(playerItems) do
    if item.getDescription() == "Agent" then
      item.setPositionSmooth(agentPos, false,true)
      agentCheck = 1
      local cubeQuery = getObjectFromGUID(influenceZone).getObjects()
      for _, itemT in ipairs(cubeQuery) do
        if itemT.tag == "Block" and itemT.getName() == defaultColorList[playerZone] then
            local pos = itemT.getPosition()
            pos.y = 1.5
            pos.z = pos.z + 0.9

            if round(pos.z,2) == 15.02 or round(pos.z,2) == 15.18 then
              pos.z = 14.80
            elseif round(pos.z,2) == 14.28 then
              pos.z = 14.12
            end

            itemT.setPositionSmooth(pos,false,true)
            if round(pos.z,2) == 11.58 then
              getObjectFromGUID("2da390").call(vpIncrease[playerZone],{})
              params = {playerZone}
              Global.call("updateEmperorInfluence", {params})
            end
            if (round(pos.x,2) >= -10.91) and (round(pos.x,2) <= -9.44) and (round(pos.z,2) >= 13.38) and (round(pos.z,2) <= 14.80) then
              local params = {itemT}
              getObjectFromGUID("13e990").call("allianceCheck",{params})
            end
        end
      end
      break
    end
   end
  elseif agentPresence == 1 then
    broadcastToAll("Agent Already Present at this Location")
  end
  else
    broadcastToAll("Blocked by The Voice!")
  end

  if voiceCheck == 0 and agentCheck == 0 and agentPresence == 0 then
    broadcastToAll(color .. " Player has no Agents Available to Send", stringColorToRGB(color))
  end

end

function round(num, dec)
    local mult = 10^(dec or 0)
    return math.floor(num * mult + 0.5) / mult
end

-- ===== Custom_Tile 70d8e5 (3296 chars) =====
defaultColorList = {"Red", "Blue", "Orange", "Green"}
vpIncrease = {"upRed", "upBlue", "upOrange", "upGreen"} 
influenceZone = "75ce34"

playerBoard = {"bd39f6", "9b4f33", "bd5bf6", "231215"}
locationZone = "de7762"

function onLoad()
  self.clearButtons()
  self.createButton ({
    ['click_function'] = 'placeAgent',
    ['label'] = 'Send Agent',
    ['function_owner'] = self,
    ['position'] = {0, 0.1, 0.0},
    ['rotation'] =  {0, 0, 0},
    ['scale'] = {1.0,1.0,1.0},
    ['width'] = 3600,
    ['height'] = 800,
    ['font_size'] = 550,
    ['color'] = {0,0,0},
    ['font_color'] = "White"
  })
end

function placeAgent(GO, color)
  local playerZone = 0
  local playerItems = {}
  local agentPos = getObjectFromGUID(locationZone).getPosition()
  
  agentPos.y = agentPos.y + 0.5

  if color == "Red" then
    playerZone = 1
  elseif color == "Blue" then
    playerZone = 2
  elseif color == "Orange" then
    playerZone = 3
  elseif color == "Green" then
    playerZone = 4
  end

  local agentPresence = 0
  local locationItems = getObjectFromGUID(locationZone).getObjects()

  for _, obj in ipairs(locationItems) do
    if obj.getDescription() == "Agent" then
      agentPresence = 1
    end
  end

  playerItems = getObjectFromGUID(playerBoard[playerZone]).getObjects()

  local agentCheck = 0
  local voiceCheck = 0
  local voiceQuery = getObjectFromGUID("de7762").getObjects()
    for _, itemQ in ipairs(voiceQuery) do
      if itemQ.getName() == "Voice Token" then
        voiceCheck = 1  
      end
    end
  if voiceCheck == 0 then

  if agentPresence == 0 then
   for _, item in ipairs(playerItems) do
    if item.getDescription() == "Agent" then
      item.setPositionSmooth(agentPos, false,true)
      agentCheck = 1
      local cubeQuery = getObjectFromGUID(influenceZone).getObjects()
      for _, itemT in ipairs(cubeQuery) do
        if itemT.tag == "Block" and itemT.getName() == defaultColorList[playerZone] then
            local pos = itemT.getPosition()
            pos.y = 1.5
            pos.z = pos.z + 0.9

            if round(pos.z,2) == 15.02 or round(pos.z,2) == 15.18 then
              pos.z = 14.80
            elseif round(pos.z,2) == 14.28 then
              pos.z = 14.12
            end

            itemT.setPositionSmooth(pos,false,true)
            if round(pos.z,2) == 11.58 then
              getObjectFromGUID("2da390").call(vpIncrease[playerZone],{})
              params = {playerZone}
              Global.call("updateEmperorInfluence", {params})
            end
            if (round(pos.x,2) >= -10.91) and (round(pos.x,2) <= -9.44) and (round(pos.z,2) >= 13.38) and (round(pos.z,2) <= 14.80) then
              local params = {itemT}
              getObjectFromGUID("13e990").call("allianceCheck",{params})
            end
        end
      end
      break
    end
   end
  elseif agentPresence == 1 then
    broadcastToAll("Agent Already Present at this Location")
  end
  else
    broadcastToAll("Blocked by The Voice!")
  end

  if voiceCheck == 0 and agentCheck == 0 and agentPresence == 0 then
    broadcastToAll(color .. " Player has no Agents Available to Send", stringColorToRGB(color))
  end

end

function round(num, dec)
    local mult = 10^(dec or 0)
    return math.floor(num * mult + 0.5) / mult
end

-- ===== Custom_Tile c16d62 (3286 chars) =====
defaultColorList = {"Red", "Blue", "Orange", "Green"}
vpIncrease = {"upRed", "upBlue", "upOrange", "upGreen"} 
influenceZone = "4a0d84"

playerBoard = {"bd39f6", "9b4f33", "bd5bf6", "231215"}
locationZone = "c879a0"

function onLoad()
  self.clearButtons()
  self.createButton ({
    ['click_function'] = 'placeAgent',
    ['label'] = 'Send Agent',
    ['function_owner'] = self,
    ['position'] = {0, 0.1, 0.0},
    ['rotation'] =  {0, 0, 0},
    ['scale'] = {1.0,1.0,1.0},
    ['width'] = 3600,
    ['height'] = 800,
    ['font_size'] = 550,
    ['color'] = {0,0,0},
    ['font_color'] = "White"
  })
end

function placeAgent(GO, color)
  local playerZone = 0
  local playerItems = {}
  local agentPos = getObjectFromGUID(locationZone).getPosition()
  
  agentPos.y = agentPos.y + 0.5

  if color == "Red" then
    playerZone = 1
  elseif color == "Blue" then
    playerZone = 2
  elseif color == "Orange" then
    playerZone = 3
  elseif color == "Green" then
    playerZone = 4
  end

  local agentPresence = 0
  local locationItems = getObjectFromGUID(locationZone).getObjects()

  for _, obj in ipairs(locationItems) do
    if obj.getDescription() == "Agent" then
      agentPresence = 1
    end
  end

  playerItems = getObjectFromGUID(playerBoard[playerZone]).getObjects()

  local agentCheck = 0
  local voiceCheck = 0
  local voiceQuery = getObjectFromGUID("c879a0").getObjects()
    for _, itemQ in ipairs(voiceQuery) do
      if itemQ.getName() == "Voice Token" then
        voiceCheck = 1  
      end
    end
  if voiceCheck == 0 then

  if agentPresence == 0 then
   for _, item in ipairs(playerItems) do
    if item.getDescription() == "Agent" then
      item.setPositionSmooth(agentPos, false,true)
      agentCheck = 1
      local cubeQuery = getObjectFromGUID(influenceZone).getObjects()
      for _, itemT in ipairs(cubeQuery) do
        if itemT.tag == "Block" and itemT.getName() == defaultColorList[playerZone] then
            local pos = itemT.getPosition()
            pos.y = 1.5
            pos.z = pos.z + 0.9

            if round(pos.z,2) == 8.83 or round(pos.z,2) == 9.01 then
              pos.z = 8.64
            elseif round(pos.z,2) == 8.11 then
              pos.z = 7.93
            end

            itemT.setPositionSmooth(pos,false,true)
            if round(pos.z,2) == 5.41 then
              getObjectFromGUID("2da390").call(vpIncrease[playerZone],{})
              params = {playerZone}
              Global.call("updateGuildInfluence", {params})
            end
            if (round(pos.x,2) >= -10.91) and (round(pos.x,2) <= -9.44) and (round(pos.z,2) >= 7.21) and (round(pos.z,2) <= 8.64) then
              local params = {itemT}
              getObjectFromGUID("ad1aae").call("allianceCheck",{params})
            end
        end
      end
      break
    end
   end
  elseif agentPresence == 1 then
    broadcastToAll("Agent Already Present at this Location")
  end
  else
    broadcastToAll("Blocked by The Voice!")
  end

  if voiceCheck == 0 and agentCheck == 0 and agentPresence == 0 then
    broadcastToAll(color .. " Player has no Agents Available to Send", stringColorToRGB(color))
  end

end

function round(num, dec)
    local mult = 10^(dec or 0)
    return math.floor(num * mult + 0.5) / mult
end

-- ===== Custom_Tile bddd6a (3287 chars) =====
defaultColorList = {"Red", "Blue", "Orange", "Green"}
vpIncrease = {"upRed", "upBlue", "upOrange", "upGreen"} 
influenceZone = "4a0d84"

playerBoard = {"bd39f6", "9b4f33", "bd5bf6", "231215"}
locationZone = "57c221"

function onLoad()
  self.clearButtons()
  self.createButton ({
    ['click_function'] = 'placeAgent',
    ['label'] = 'Send Agent',
    ['function_owner'] = self,
    ['position'] = {0, 0.1, 0.0},
    ['rotation'] =  {0, 0, 0},
    ['scale'] = {1.0,1.0,1.0},
    ['width'] = 3600,
    ['height'] = 800,
    ['font_size'] = 550,
    ['color'] = {0,0,0},
    ['font_color'] = "White"
  })
end

function placeAgent(GO, color)
  local playerZone = 0
  local playerItems = {}
  local agentPos = getObjectFromGUID(locationZone).getPosition()
  
  agentPos.y = agentPos.y + 0.5

  if color == "Red" then
    playerZone = 1
  elseif color == "Blue" then
    playerZone = 2
  elseif color == "Orange" then
    playerZone = 3
  elseif color == "Green" then
    playerZone = 4
  end

  local agentPresence = 0
  local locationItems = getObjectFromGUID(locationZone).getObjects()

  for _, obj in ipairs(locationItems) do
    if obj.getDescription() == "Agent" then
      agentPresence = 1
    end
  end

  playerItems = getObjectFromGUID(playerBoard[playerZone]).getObjects()

  local agentCheck = 0
  local voiceCheck = 0
  local voiceQuery = getObjectFromGUID("57c221").getObjects()
    for _, itemQ in ipairs(voiceQuery) do
      if itemQ.getName() == "Voice Token" then
        voiceCheck = 1  
      end
    end
  if voiceCheck == 0 then

  if agentPresence == 0 then
   for _, item in ipairs(playerItems) do
    if item.getDescription() == "Agent" then
      item.setPositionSmooth(agentPos, false,true)
      agentCheck = 1
      local cubeQuery = getObjectFromGUID(influenceZone).getObjects()
      for _, itemT in ipairs(cubeQuery) do
        if itemT.tag == "Block" and itemT.getName() == defaultColorList[playerZone] then
            local pos = itemT.getPosition()
            pos.y = 1.5
            pos.z = pos.z + 0.9

            if round(pos.z,2) == 8.83 or round(pos.z,2) == 9.01 then
              pos.z = 8.64
            elseif round(pos.z,2) == 8.11 then
              pos.z = 7.93
            end

            itemT.setPositionSmooth(pos,false,true)
            if round(pos.z,2) == 5.41 then
              getObjectFromGUID("2da390").call(vpIncrease[playerZone],{})
              params = {playerZone}
              Global.call("updateGuildInfluence", {params})
            end

            if (round(pos.x,2) >= -10.91) and (round(pos.x,2) <= -9.44) and (round(pos.z,2) >= 7.21) and (round(pos.z,2) <= 8.64) then
              local params = {itemT}
              getObjectFromGUID("ad1aae").call("allianceCheck",{params})
            end
        end
      end
      break
    end
   end
  elseif agentPresence == 1 then
    broadcastToAll("Agent Already Present at this Location")
  end
  else
    broadcastToAll("Blocked by The Voice!")
  end

  if voiceCheck == 0 and agentCheck == 0 and agentPresence == 0 then
    broadcastToAll(color .. " Player has no Agents Available to Send", stringColorToRGB(color))
  end

end

function round(num, dec)
    local mult = 10^(dec or 0)
    return math.floor(num * mult + 0.5) / mult
end

-- ===== Custom_Tile aab325 (3288 chars) =====
defaultColorList = {"Red", "Blue", "Orange", "Green"}
vpIncrease = {"upRed", "upBlue", "upOrange", "upGreen"} 
influenceZone = "0de027"

playerBoard = {"bd39f6", "9b4f33", "bd5bf6", "231215"}
locationZone = "90c61c"

function onLoad()
  self.clearButtons()
  self.createButton ({
    ['click_function'] = 'placeAgent',
    ['label'] = 'Send Agent',
    ['function_owner'] = self,
    ['position'] = {0, 0.1, 0.0},
    ['rotation'] =  {0, 0, 0},
    ['scale'] = {1.0,1.0,1.0},
    ['width'] = 3600,
    ['height'] = 800,
    ['font_size'] = 550,
    ['color'] = {0,0,0},
    ['font_color'] = "White"
  })
end

function placeAgent(GO, color)
  local playerZone = 0
  local playerItems = {}
  local agentPos = getObjectFromGUID(locationZone).getPosition()
  
  agentPos.y = agentPos.y + 0.5

  if color == "Red" then
    playerZone = 1
  elseif color == "Blue" then
    playerZone = 2
  elseif color == "Orange" then
    playerZone = 3
  elseif color == "Green" then
    playerZone = 4
  end

  local agentPresence = 0
  local locationItems = getObjectFromGUID(locationZone).getObjects()

  for _, obj in ipairs(locationItems) do
    if obj.getDescription() == "Agent" then
      agentPresence = 1
    end
  end

  playerItems = getObjectFromGUID(playerBoard[playerZone]).getObjects()

  local agentCheck = 0
  local voiceCheck = 0
  local voiceQuery = getObjectFromGUID("90c61c").getObjects()
    for _, itemQ in ipairs(voiceQuery) do
      if itemQ.getName() == "Voice Token" then
        voiceCheck = 1  
      end
    end
  if voiceCheck == 0 then

  if agentPresence == 0 then
   for _, item in ipairs(playerItems) do
    if item.getDescription() == "Agent" then
      item.setPositionSmooth(agentPos, false,true)
      agentCheck = 1
      local cubeQuery = getObjectFromGUID(influenceZone).getObjects()
      for _, itemT in ipairs(cubeQuery) do
        if itemT.tag == "Block" and itemT.getName() == defaultColorList[playerZone] then
            local pos = itemT.getPosition()
            pos.y = 1.5
            pos.z = pos.z + 0.9

            if round(pos.z,2) == 2.86 or round(pos.z,2) == 2.70 then
              pos.z = 2.53
            elseif round(pos.z,2) == 1.96 then
              pos.z = 1.80
            end

            itemT.setPositionSmooth(pos,false,true)
            if round(pos.z,2) == -0.74 then
              getObjectFromGUID("2da390").call(vpIncrease[playerZone],{})
              params = {playerZone}
              Global.call("updateBeneInfluence", {params})
            end
            if (round(pos.x,2) >= -10.91) and (round(pos.x,2) <= -9.44) and (round(pos.z,2) >= 1.06) and (round(pos.z,2) <= 2.53) then
              local params = {itemT}
              getObjectFromGUID("33452e").call("allianceCheck",{params})
            end
        end
      end
      break
    end
   end
  elseif agentPresence == 1 then
    broadcastToAll("Agent Already Present at this Location")
  end
  else
    broadcastToAll("Blocked by The Voice!")
  end

  if voiceCheck == 0 and agentCheck == 0 and agentPresence == 0 then
    broadcastToAll(color .. " Player has no Agents Available to Send", stringColorToRGB(color))
  end

end

function round(num, dec)
    local mult = 10^(dec or 0)
    return math.floor(num * mult + 0.5) / mult
end

-- ===== Custom_Tile 734fac (3288 chars) =====
defaultColorList = {"Red", "Blue", "Orange", "Green"}
vpIncrease = {"upRed", "upBlue", "upOrange", "upGreen"} 
influenceZone = "0de027"

playerBoard = {"bd39f6", "9b4f33", "bd5bf6", "231215"}
locationZone = "545477"


function onLoad()
  self.clearButtons()
  self.createButton ({
    ['click_function'] = 'placeAgent',
    ['label'] = 'Send Agent',
    ['function_owner'] = self,
    ['position'] = {0, 0.1, 0.0},
    ['rotation'] =  {0, 0, 0},
    ['scale'] = {1.0,1.0,1.0},
    ['width'] = 3600,
    ['height'] = 800,
    ['font_size'] = 550,
    ['color'] = {0,0,0},
    ['font_color'] = "White"
  })
end

function placeAgent(GO, color)
  local playerZone = 0
  local playerItems = {}
  local agentPos = getObjectFromGUID(locationZone).getPosition()
  
  agentPos.y = agentPos.y + 0.5

  if color == "Red" then
    playerZone = 1
  elseif color == "Blue" then
    playerZone = 2
  elseif color == "Orange" then
    playerZone = 3
  elseif color == "Green" then
    playerZone = 4
  end

  local agentPresence = 0
  local locationItems = getObjectFromGUID(locationZone).getObjects()

  for _, obj in ipairs(locationItems) do
    if obj.getDescription() == "Agent" then
      agentPresence = 1
    end
  end

  playerItems = getObjectFromGUID(playerBoard[playerZone]).getObjects()

  local agentCheck = 0
  local voiceCheck = 0
  local voiceQuery = getObjectFromGUID("545477").getObjects()
    for _, itemQ in ipairs(voiceQuery) do
      if itemQ.getName() == "Voice Token" then
        voiceCheck = 1  
      end
    end
  if voiceCheck == 0 then

  if agentPresence == 0 then
   for _, item in ipairs(playerItems) do
    if item.getDescription() == "Agent" then
      item.setPositionSmooth(agentPos, false,true)
      agentCheck = 1
      local cubeQuery = getObjectFromGUID(influenceZone).getObjects()
      for _, itemT in ipairs(cubeQuery) do
        if itemT.tag == "Block" and itemT.getName() == defaultColorList[playerZone] then
            local pos = itemT.getPosition()
            pos.y = 1.5
            pos.z = pos.z + 0.9

            if round(pos.z,2) == 2.86 or round(pos.z,2) == 2.70 then
              pos.z = 2.53
            elseif round(pos.z,2) == 1.96 then
              pos.z = 1.80
            end

            itemT.setPositionSmooth(pos,false,true)
            if round(pos.z,2) == -0.74 then
              getObjectFromGUID("2da390").call(vpIncrease[playerZone],{})
              params = {playerZone}
              Global.call("updateBeneInfluence", {params})
            end
            if (round(pos.x,2) >= -10.91) and (round(pos.x,2) <= -9.44) and (round(pos.z,2) >= 1.06) and (round(pos.z,2) <= 2.53) then
              local params = {itemT}
              getObjectFromGUID("33452e").call("allianceCheck",{params})
            end
        end
      end
      break
    end
   end
  elseif agentPresence == 1 then
    broadcastToAll("Agent Already Present at this Location")
  end
  else
    broadcastToAll("Blocked by The Voice!")
  end

  if voiceCheck == 0 and agentCheck == 0 and agentPresence == 0 then
    broadcastToAll(color .. " Player has no Agents Available to Send", stringColorToRGB(color))
  end

end

function round(num, dec)
    local mult = 10^(dec or 0)
    return math.floor(num * mult + 0.5) / mult
end

-- ===== Custom_Tile 355820 (3294 chars) =====
defaultColorList = {"Red", "Blue", "Orange", "Green"}
playerBoard = {"bd39f6", "9b4f33", "bd5bf6", "231215"}
vpIncrease = {"upRed", "upBlue", "upOrange", "upGreen"} 

locationZone = "2ec4da"
influenceZone = "799d77"

function onLoad()
  self.clearButtons()
  self.createButton ({
    ['click_function'] = 'placeAgent',
    ['label'] = 'Send Agent',
    ['function_owner'] = self,
    ['position'] = {0, 0.1, 0.0},
    ['rotation'] =  {0, 0, 0},
    ['scale'] = {1.0,1.0,1.0},
    ['width'] = 3600,
    ['height'] = 800,
    ['font_size'] = 550,
    ['color'] = {0,0,0},
    ['font_color'] = "White"
  })
end

function placeAgent(GO, color)
  local playerZone = 0
  local playerItems = {}
  local agentPos = getObjectFromGUID(locationZone).getPosition()
  
  agentPos.y = agentPos.y + 0.5

  if color == "Red" then
    playerZone = 1
  elseif color == "Blue" then
    playerZone = 2
  elseif color == "Orange" then
    playerZone = 3
  elseif color == "Green" then
    playerZone = 4
  end

  local agentPresence = 0
  local locationItems = getObjectFromGUID(locationZone).getObjects()

  for _, obj in ipairs(locationItems) do
    if obj.getDescription() == "Agent" then
      agentPresence = 1
    end
  end

  playerItems = getObjectFromGUID(playerBoard[playerZone]).getObjects()

  local agentCheck = 0
  local voiceCheck = 0
  local voiceQuery = getObjectFromGUID("2ec4da").getObjects()
    for _, itemQ in ipairs(voiceQuery) do
      if itemQ.getName() == "Voice Token" then
        voiceCheck = 1  
      end
    end
  if voiceCheck == 0 then

  if agentPresence == 0 then
   for _, item in ipairs(playerItems) do
    if item.getDescription() == "Agent" then
      item.setPositionSmooth(agentPos, false,true)
      agentCheck = 1
      local cubeQuery = getObjectFromGUID(influenceZone).getObjects()
      for _, itemT in ipairs(cubeQuery) do
        if itemT.tag == "Block" and itemT.getName() == defaultColorList[playerZone] then
            local pos = itemT.getPosition()
            pos.y = 1.5
            pos.z = pos.z + 0.9

            if round(pos.z,2) == -3.22 or round(pos.z,2) == -3.39 then
              pos.z = -3.62
            elseif round(pos.z,2) == -4.12 then
              pos.z = -4.29
            end

            itemT.setPositionSmooth(pos,false,true)
            if round(pos.z,2) == -6.82 then
              getObjectFromGUID("2da390").call(vpIncrease[playerZone],{})
              params = {playerZone}
              Global.call("updateFremenInfluence", {params})
            end
            if (round(pos.x,2) >= -10.91) and (round(pos.x,2) <= -9.44) and (round(pos.z,2) >= -5.02) and (round(pos.z,2) <= -3.62) then
              local params = {itemT}
              getObjectFromGUID("4c2bcc").call("allianceCheck",{params})
            end
        end
      end
      break
    end
   end
  elseif agentPresence == 1 then
    broadcastToAll("Agent Already Present at this Location")
  end
  else
    broadcastToAll("Blocked by The Voice!")
  end

  if voiceCheck == 0 and agentCheck == 0 and agentPresence == 0 then
    broadcastToAll(color .. " Player has no Agents Available to Send", stringColorToRGB(color))
  end

end

function round(num, dec)
    local mult = 10^(dec or 0)
    return math.floor(num * mult + 0.5) / mult
end

-- ===== Custom_Tile 5d0684 (3288 chars) =====
defaultColorList = {"Red", "Blue", "Orange", "Green"}
playerBoard = {"bd39f6", "9b4f33", "bd5bf6", "231215"}
vpIncrease = {"upRed", "upBlue", "upOrange", "upGreen"} 

locationZone = "24973a"
influenceZone = "799d77"

function onLoad()
  self.clearButtons()
  self.createButton ({
    ['click_function'] = 'placeAgent',
    ['label'] = 'Send Agent',
    ['function_owner'] = self,
    ['position'] = {0, 0.1, 0.0},
    ['rotation'] =  {0, 0, 0},
    ['scale'] = {1.0,1.0,1.0},
    ['width'] = 3600,
    ['height'] = 800,
    ['font_size'] = 550,
    ['color'] = {0,0,0},
    ['font_color'] = "White"
  })
end

function placeAgent(GO, color)
  local playerZone = 0
  local playerItems = {}
  local agentPos = getObjectFromGUID(locationZone).getPosition()
  
  agentPos.y = agentPos.y + 0.5

  if color == "Red" then
    playerZone = 1
  elseif color == "Blue" then
    playerZone = 2
  elseif color == "Orange" then
    playerZone = 3
  elseif color == "Green" then
    playerZone = 4
  end

  local agentPresence = 0
  local locationItems = getObjectFromGUID(locationZone).getObjects()

  for _, obj in ipairs(locationItems) do
    if obj.getDescription() == "Agent" then
      agentPresence = 1
    end
  end

  playerItems = getObjectFromGUID(playerBoard[playerZone]).getObjects()

  local agentCheck = 0
  local voiceCheck = 0
  local voiceQuery = getObjectFromGUID("24973a").getObjects()
    for _, itemQ in ipairs(voiceQuery) do
      if itemQ.getName() == "Voice Token" then
        voiceCheck = 1  
      end
    end
  if voiceCheck == 0 then

  if agentPresence == 0 then
   for _, item in ipairs(playerItems) do
    if item.getDescription() == "Agent" then
      item.setPositionSmooth(agentPos, false,true)
      agentCheck = 1
      local cubeQuery = getObjectFromGUID(influenceZone).getObjects()
      for _, itemT in ipairs(cubeQuery) do
        if itemT.tag == "Block" and itemT.getName() == defaultColorList[playerZone] then
            local pos = itemT.getPosition()
            pos.y = 1.5
            pos.z = pos.z + 0.9

            if round(pos.z,2) == -3.22 or round(pos.z,2) == -3.39 then
              pos.z = -3.62
            elseif round(pos.z,2) == -4.12 then
              pos.z = -4.29
            end

            itemT.setPositionSmooth(pos,false,true)
            if round(pos.z,2) == -6.82 then
              getObjectFromGUID("2da390").call(vpIncrease[playerZone],{})
              params = {playerZone}
              Global.call("updateFremenInfluence", {params})
            end
            if (round(pos.x,2) >= -10.91) and (round(pos.x,2) <= -9.44) and (round(pos.z,2) >= -5.02) and (round(pos.z,2) <= -3.62) then
              local params = {itemT}
              getObjectFromGUID("4c2bcc").call("allianceCheck",{params})
            end
        end
      end
      break
    end
   end
  elseif agentPresence == 1 then
    broadcastToAll("Agent Already Present at this Location")
  end
  else
    broadcastToAll("Blocked by The Voice!")
  end

  if voiceCheck == 0 and agentCheck == 0 and agentPresence == 0 then
    broadcastToAll(color .. " Player has no Agents Available to Send", stringColorToRGB(color))
  end
end

function round(num, dec)
  local mult = 10^(dec or 0)
  return math.floor(num * mult + 0.5) / mult
end

-- ===== Custom_Tile 49293f (681 chars) =====
playerBoards = {['Red'] = "a0fa97", ['Blue'] = "042887", ['Orange'] = "e435ab", ['Green'] = "f8a49f"}

function onLoad()
  self.clearButtons()
  self.createButton({
     click_function = "addToGarrison",
     function_owner = self,
     label          = "Add Troop to Garrison",
     position       = {0.0,0.1,0.0},
     rotation       = {0, 0, 0},
     scale          = {1, 1, 1},
     width          = 3800,
     height         = 850,
     tooltip        = "",
     font_color     = {1, 1, 1},
     font_size      = 375,
     color          = {0,0,0},
     })
end

function addToGarrison(GO, color)
  getObjectFromGUID(playerBoards[color]).call("addGarrison",{})
end

-- ===== Custom_Tile d46be8 (681 chars) =====
playerBoards = {['Red'] = "a0fa97", ['Blue'] = "042887", ['Orange'] = "e435ab", ['Green'] = "f8a49f"}

function onLoad()
  self.clearButtons()
  self.createButton({
     click_function = "addToGarrison",
     function_owner = self,
     label          = "Add Troop to Garrison",
     position       = {0.0,0.1,0.0},
     rotation       = {0, 0, 0},
     scale          = {1, 1, 1},
     width          = 3800,
     height         = 850,
     tooltip        = "",
     font_color     = {1, 1, 1},
     font_size      = 375,
     color          = {0,0,0},
     })
end

function addToGarrison(GO, color)
  getObjectFromGUID(playerBoards[color]).call("addGarrison",{})
end

-- ===== Custom_Tile b2b733 (681 chars) =====
playerBoards = {['Red'] = "a0fa97", ['Blue'] = "042887", ['Orange'] = "e435ab", ['Green'] = "f8a49f"}

function onLoad()
  self.clearButtons()
  self.createButton({
     click_function = "addToConflict",
     function_owner = self,
     label          = "Add Troop to Conflict",
     position       = {0.0,0.1,0.0},
     rotation       = {0, 0, 0},
     scale          = {1, 1, 1},
     width          = 3800,
     height         = 850,
     tooltip        = "",
     font_color     = {1, 1, 1},
     font_size      = 375,
     color          = {0,0,0},
     })
end

function addToConflict(GO, color)
  getObjectFromGUID(playerBoards[color]).call("addConflict",{})
end

-- ===== Custom_Tile 9356f0 (3266 chars) =====
hagalDraw = {"019932", "922c70", "5fbaf4", "cef5cb"}
hagalDiscard = {"c27bfc", "899024", "86177c", "9a3af6"}

boardZone = {"bd39f6", "9b4f33", "bd5bf6", "231215"}
playerBoard = {"a0fa97", "042887", "e435ab", "f8a49f"}

imperiumDeckZone = "ad3c5a"
imperiumRow = {"b17148", "a4f598", "2f3821", "52cc32", "85a5fe"}
trashBin = "288283"

function onLoad()

  buttonRed = 63
  buttonGreen = 121
  buttonBlue = 146

  buttonRed = buttonRed/255
  buttonGreen = buttonGreen/255
  buttonBlue = buttonBlue/255

  self.clearButtons()
  self.createButton ({
    ['click_function'] = 'drawHagal',
    ['label'] = 'Draw Rival Combat Card',
    ['function_owner'] = self,
    ['position'] = {0.00, 0.2, 0.0},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 3750,
    ['height'] = 900,
    ['font_size'] = 325,
    ['color'] = {buttonRed, buttonGreen, buttonBlue},
    ['font_color'] = "White"
  })
end

function GetDeckOrCard(zoneGUID)
  for _, obj in ipairs(getObjectFromGUID(zoneGUID).getObjects()) do
    if obj.name == "Card" or obj.name == "CardCustom" or obj.name == "Deck" or obj.name == "DeckCustom" then
      return obj
    end
  end
 return nil
end

function drawHagal()
  for i=1,4 do
    local hagalDeck = GetDeckOrCard(hagalDraw[i])
    if hagalDeck != nil then
      hagalPos = getObjectFromGUID(hagalDiscard[i]).getPosition()
      hagalPos.y = 2
    end
    if hagalDeck != nil then
      if hagalDeck.name == "Deck" then
        cardDraw = hagalDeck.takeObject({position = hagalPos, flip = true})
      elseif hagalDeck.name == "Card" then
        cardDraw = hagalDeck
        cardDraw.flip()
        cardDraw.setPositionSmooth(hagalPos)
        self.editButton({index=0,label="Reshuffle?",click_function="reshuffleDeck"})
      end
    end
  end

  if cardDraw.getName() == "Imperium Churn" then
    broadcastToAll("Imperium Churn")
    cardChurn()
  end

end

function reshuffleDeck()
  for i=1,4 do
    local hagalDeck = GetDeckOrCard(hagalDiscard[i])
    if hagalDeck != nil then
        refreshPos = getObjectFromGUID(hagalDraw[i]).getPosition()
        refreshPos.y = 2
        hagalDeck.flip()
        hagalDeck.setPositionSmooth(refreshPos,false,true)
        Wait.frames(function()
          local hagalDraw = GetDeckOrCard(hagalDraw[i])
          hagalDraw.shuffle()
          hagalDraw.shuffle()
        end,45)
       self.editButton({index=0,label="Draw Rival Combat Card",click_function="drawHagal"})
    end
  end
end

function cardChurn()
  math.randomseed(os.time())
  local spotOne = math.random(1,5)
  ::GenNum::
  local spotTwo = math.random(1,5)
  if spotOne == spotTwo then
    goto GenNum
  end

  local cardOne = GetDeckOrCard(imperiumRow[spotOne])
  local cardTwo = GetDeckOrCard(imperiumRow[spotTwo])

  local posOne = cardOne.getPosition()
  local posTwo = cardTwo.getPosition()

  getObjectFromGUID(trashBin).putObject(cardOne)
  Wait.frames(function()
    getObjectFromGUID(trashBin).putObject(cardTwo)
  end,30)

  posOne.y = 2
  posTwo.y = 2

  Wait.frames(function()
    GetDeckOrCard(imperiumDeckZone).takeObject({position = posOne, flip = true})
  end,60)
  Wait.frames(function()
    GetDeckOrCard(imperiumDeckZone).takeObject({position = posTwo, flip = true})
  end,90)

end

-- ===== Custom_Tile 096653 (1212 chars) =====
revealedCards = {}

function onLoad()
  self.clearButtons()
  self.createButton({
     click_function = "revealHand",
     function_owner = self,
     label          = "Reveal Hand",
     position       = {0.0,0.1,0.0},
     rotation       = {0, 0, 0},
     scale          = {1, 1, 1},
     width          = 3800,
     height         = 850,
     tooltip        = "",
     font_color     = {1, 1, 1},
     font_size      = 375,
     color          = {0,0,0},
     })

end

function revealHand()
  playerHand = Player["Blue"].getHandObjects()
  c = 0
  d = 0
  e = -2
  local count = 0
  for _, obj in ipairs(playerHand) do
    local scale = obj.getScale()
    if round(scale.x,2) != 0.88 and round(scale.z,2) != 0.88 then
     if obj.getDescription() != "Intrigue" then
      obj.setPosition({-15.00 + c, 1.00 + d, e})
      table.insert(revealedCards, obj.getGUID())
      c = c - 2.5
      d = d + 0.25
      count = count + 1
      if count == 6 then
        c = 0
        e = e + 3.5
        count = 0
      end
    end
   end
  end
end

function round(num, dec)
    local mult = 10^(dec or 0)
    return math.floor(num * mult + 0.5) / mult
end

function resetReveal()
  revealedCards = {}
end

-- ===== Custom_Tile 3f4f80 (1212 chars) =====
revealedCards = {}

function onLoad()
  self.clearButtons()
  self.createButton({
     click_function = "revealHand",
     function_owner = self,
     label          = "Reveal Hand",
     position       = {0.0,0.1,0.0},
     rotation       = {0, 0, 0},
     scale          = {1, 1, 1},
     width          = 3800,
     height         = 850,
     tooltip        = "",
     font_color     = {1, 1, 1},
     font_size      = 375,
     color          = {0,0,0},
     })

end

function revealHand()
  playerHand = Player["Green"].getHandObjects()
  c = 0
  d = 0
  e = -2
  local count = 0
  for _, obj in ipairs(playerHand) do
    local scale = obj.getScale()
    if round(scale.x,2) != 0.88 and round(scale.z,2) != 0.88 then
     if obj.getDescription() != "Intrigue" then
      obj.setPosition({40.00 + c, 1.00 + d, e})
      table.insert(revealedCards, obj.getGUID())
      c = c + 2.5
      d = d + 0.25
      count = count + 1
      if count == 6 then
        c = 0
        e = e + 3.5
        count = 0
      end
    end
   end
  end
end

function round(num, dec)
    local mult = 10^(dec or 0)
    return math.floor(num * mult + 0.5) / mult
end

function resetReveal()
  revealedCards = {}
end

-- ===== Custom_Tile 922131 (1213 chars) =====
revealedCards = {}

function onLoad()
  self.clearButtons()
  self.createButton({
     click_function = "revealHand",
     function_owner = self,
     label          = "Reveal Hand",
     position       = {0.0,0.1,0.0},
     rotation       = {0, 0, 0},
     scale          = {1, 1, 1},
     width          = 3800,
     height         = 850,
     tooltip        = "",
     font_color     = {1, 1, 1},
     font_size      = 375,
     color          = {0,0,0},
     })

end

function revealHand()
  playerHand = Player["Orange"].getHandObjects()
  c = 0
  d = 0
  e = -2
  local count = 0
  for _, obj in ipairs(playerHand) do
    local scale = obj.getScale()
    if round(scale.x,2) != 0.88 and round(scale.z,2) != 0.88 then
     if obj.getDescription() != "Intrigue" then
      obj.setPosition({15.00 + c, 1.00 + d, e})
      table.insert(revealedCards, obj.getGUID())
      c = c + 2.5
      d = d + 0.25
      count = count + 1
      if count == 6 then
        c = 0
        e = e + 3.5
        count = 0
      end
    end
   end
  end
end

function round(num, dec)
    local mult = 10^(dec or 0)
    return math.floor(num * mult + 0.5) / mult
end

function resetReveal()
  revealedCards = {}
end

-- ===== Custom_Tile e1c44b (1211 chars) =====
revealedCards = {}

function onLoad()
  self.clearButtons()
  self.createButton({
     click_function = "revealHand",
     function_owner = self,
     label          = "Reveal Hand",
     position       = {0.0,0.1,0.0},
     rotation       = {0, 0, 0},
     scale          = {1, 1, 1},
     width          = 3800,
     height         = 850,
     tooltip        = "",
     font_color     = {1, 1, 1},
     font_size      = 375,
     color          = {0,0,0},
     })

end

function revealHand()
  playerHand = Player["Red"].getHandObjects()
  c = 0
  d = 0
  e = -2
  local count = 0
  for _, obj in ipairs(playerHand) do
    local scale = obj.getScale()
    if round(scale.x,2) != 0.88 and round(scale.z,2) != 0.88 then
     if obj.getDescription() != "Intrigue" then
      obj.setPosition({-40.00 + c, 1.00 + d, e})
      table.insert(revealedCards, obj.getGUID())
      c = c - 2.5
      d = d + 0.25
      count = count + 1
      if count == 6 then
        c = 0
        e = e + 3.5
        count = 0
      end
    end
   end
  end
end

function round(num, dec)
    local mult = 10^(dec or 0)
    return math.floor(num * mult + 0.5) / mult
end

function resetReveal()
  revealedCards = {}
end

-- ===== Power Play a79e37 (2132 chars) =====
function onLoad()
   self.clearButtons()
   self.createButton({
    ['click_function'] = 'trashConfirm',
    ['label'] = 'Trash the Card?',
    ['function_owner'] = self,
    ['position'] = {0, 0.2, 0.3},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 800,
    ['height'] = 200,
    ['scale'] = {0.9,0.9,0.9},
    ['font_size'] = 75,
    ['font_color'] = {1, 1, 1}
,
    ['color'] = {0,0,0}
   })
end

function trashConfirm()
   self.clearButtons()
   self.createButton({
    ['click_function'] = 'doNothing',
    ['label'] = 'Are You Sure?',
    ['function_owner'] = self,
    ['position'] = {0, 0.2, 0.3},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 800,
    ['height'] = 200,
    ['scale'] = {0.9,0.9,0.9},
    ['font_size'] = 75,
    ['font_color'] = {1, 1, 1}
,
    ['color'] = {0,0,0}
   })
   self.createButton({
    ['click_function'] = 'trashCard',
    ['label'] = 'Yes',
    ['function_owner'] = self,
    ['position'] = {-0.2, 0.2, 0.6},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 150,
    ['height'] = 100,
    ['scale'] = {0.9,0.9,0.9},
    ['font_size'] = 75,
    ['font_color'] = {1, 1, 1}
,
    ['color'] = "Green"
   })
   self.createButton({
    ['click_function'] = 'holdCard',
    ['label'] = 'No',
    ['function_owner'] = self,
    ['position'] = {0.2, 0.2, 0.6},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 150,
    ['height'] = 100,
    ['scale'] = {0.9,0.9,0.9},
    ['font_size'] = 75,
    ['font_color'] = {1, 1, 1}
,
    ['color'] = "Red"
   })
end

function holdCard()
   self.clearButtons()
   self.createButton({
    ['click_function'] = 'trashConfirm',
    ['label'] = 'Trash the Card?',
    ['function_owner'] = self,
    ['position'] = {0, 0.2, 0.3},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 800,
    ['height'] = 200,
    ['scale'] = {0.9,0.9,0.9},
    ['font_size'] = 75,
    ['font_color'] = {1, 1, 1}
,
    ['color'] = {0,0,0}
   })
end

function trashCard()
  self.clearButtons()
  getObjectFromGUID("288283").putObject(self)
  broadcastToAll("Card Trashed")
end

function doNothing()
end

-- ===== Power Play 5e030d (2132 chars) =====
function onLoad()
   self.clearButtons()
   self.createButton({
    ['click_function'] = 'trashConfirm',
    ['label'] = 'Trash the Card?',
    ['function_owner'] = self,
    ['position'] = {0, 0.2, 0.3},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 800,
    ['height'] = 200,
    ['scale'] = {0.9,0.9,0.9},
    ['font_size'] = 75,
    ['font_color'] = {1, 1, 1}
,
    ['color'] = {0,0,0}
   })
end

function trashConfirm()
   self.clearButtons()
   self.createButton({
    ['click_function'] = 'doNothing',
    ['label'] = 'Are You Sure?',
    ['function_owner'] = self,
    ['position'] = {0, 0.2, 0.3},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 800,
    ['height'] = 200,
    ['scale'] = {0.9,0.9,0.9},
    ['font_size'] = 75,
    ['font_color'] = {1, 1, 1}
,
    ['color'] = {0,0,0}
   })
   self.createButton({
    ['click_function'] = 'trashCard',
    ['label'] = 'Yes',
    ['function_owner'] = self,
    ['position'] = {-0.2, 0.2, 0.6},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 150,
    ['height'] = 100,
    ['scale'] = {0.9,0.9,0.9},
    ['font_size'] = 75,
    ['font_color'] = {1, 1, 1}
,
    ['color'] = "Green"
   })
   self.createButton({
    ['click_function'] = 'holdCard',
    ['label'] = 'No',
    ['function_owner'] = self,
    ['position'] = {0.2, 0.2, 0.6},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 150,
    ['height'] = 100,
    ['scale'] = {0.9,0.9,0.9},
    ['font_size'] = 75,
    ['font_color'] = {1, 1, 1}
,
    ['color'] = "Red"
   })
end

function holdCard()
   self.clearButtons()
   self.createButton({
    ['click_function'] = 'trashConfirm',
    ['label'] = 'Trash the Card?',
    ['function_owner'] = self,
    ['position'] = {0, 0.2, 0.3},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 800,
    ['height'] = 200,
    ['scale'] = {0.9,0.9,0.9},
    ['font_size'] = 75,
    ['font_color'] = {1, 1, 1}
,
    ['color'] = {0,0,0}
   })
end

function trashCard()
  self.clearButtons()
  getObjectFromGUID("288283").putObject(self)
  broadcastToAll("Card Trashed")
end

function doNothing()
end

-- ===== Imperial Spy f04e3d (2132 chars) =====
function onLoad()
   self.clearButtons()
   self.createButton({
    ['click_function'] = 'trashConfirm',
    ['label'] = 'Trash the Card?',
    ['function_owner'] = self,
    ['position'] = {0, 0.2, 0.3},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 800,
    ['height'] = 200,
    ['scale'] = {0.9,0.9,0.9},
    ['font_size'] = 75,
    ['font_color'] = {1, 1, 1}
,
    ['color'] = {0,0,0}
   })
end

function trashConfirm()
   self.clearButtons()
   self.createButton({
    ['click_function'] = 'doNothing',
    ['label'] = 'Are You Sure?',
    ['function_owner'] = self,
    ['position'] = {0, 0.2, 0.3},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 800,
    ['height'] = 200,
    ['scale'] = {0.9,0.9,0.9},
    ['font_size'] = 75,
    ['font_color'] = {1, 1, 1}
,
    ['color'] = {0,0,0}
   })
   self.createButton({
    ['click_function'] = 'trashCard',
    ['label'] = 'Yes',
    ['function_owner'] = self,
    ['position'] = {-0.2, 0.2, 0.6},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 150,
    ['height'] = 100,
    ['scale'] = {0.9,0.9,0.9},
    ['font_size'] = 75,
    ['font_color'] = {1, 1, 1}
,
    ['color'] = "Green"
   })
   self.createButton({
    ['click_function'] = 'holdCard',
    ['label'] = 'No',
    ['function_owner'] = self,
    ['position'] = {0.2, 0.2, 0.6},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 150,
    ['height'] = 100,
    ['scale'] = {0.9,0.9,0.9},
    ['font_size'] = 75,
    ['font_color'] = {1, 1, 1}
,
    ['color'] = "Red"
   })
end

function holdCard()
   self.clearButtons()
   self.createButton({
    ['click_function'] = 'trashConfirm',
    ['label'] = 'Trash the Card?',
    ['function_owner'] = self,
    ['position'] = {0, 0.2, 0.3},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 800,
    ['height'] = 200,
    ['scale'] = {0.9,0.9,0.9},
    ['font_size'] = 75,
    ['font_color'] = {1, 1, 1}
,
    ['color'] = {0,0,0}
   })
end

function trashCard()
  self.clearButtons()
  getObjectFromGUID("288283").putObject(self)
  broadcastToAll("Card Trashed")
end

function doNothing()
end

-- ===== Imperial Spy 3d8767 (2132 chars) =====
function onLoad()
   self.clearButtons()
   self.createButton({
    ['click_function'] = 'trashConfirm',
    ['label'] = 'Trash the Card?',
    ['function_owner'] = self,
    ['position'] = {0, 0.2, 0.3},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 800,
    ['height'] = 200,
    ['scale'] = {0.9,0.9,0.9},
    ['font_size'] = 75,
    ['font_color'] = {1, 1, 1}
,
    ['color'] = {0,0,0}
   })
end

function trashConfirm()
   self.clearButtons()
   self.createButton({
    ['click_function'] = 'doNothing',
    ['label'] = 'Are You Sure?',
    ['function_owner'] = self,
    ['position'] = {0, 0.2, 0.3},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 800,
    ['height'] = 200,
    ['scale'] = {0.9,0.9,0.9},
    ['font_size'] = 75,
    ['font_color'] = {1, 1, 1}
,
    ['color'] = {0,0,0}
   })
   self.createButton({
    ['click_function'] = 'trashCard',
    ['label'] = 'Yes',
    ['function_owner'] = self,
    ['position'] = {-0.2, 0.2, 0.6},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 150,
    ['height'] = 100,
    ['scale'] = {0.9,0.9,0.9},
    ['font_size'] = 75,
    ['font_color'] = {1, 1, 1}
,
    ['color'] = "Green"
   })
   self.createButton({
    ['click_function'] = 'holdCard',
    ['label'] = 'No',
    ['function_owner'] = self,
    ['position'] = {0.2, 0.2, 0.6},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 150,
    ['height'] = 100,
    ['scale'] = {0.9,0.9,0.9},
    ['font_size'] = 75,
    ['font_color'] = {1, 1, 1}
,
    ['color'] = "Red"
   })
end

function holdCard()
   self.clearButtons()
   self.createButton({
    ['click_function'] = 'trashConfirm',
    ['label'] = 'Trash the Card?',
    ['function_owner'] = self,
    ['position'] = {0, 0.2, 0.3},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 800,
    ['height'] = 200,
    ['scale'] = {0.9,0.9,0.9},
    ['font_size'] = 75,
    ['font_color'] = {1, 1, 1}
,
    ['color'] = {0,0,0}
   })
end

function trashCard()
  self.clearButtons()
  getObjectFromGUID("288283").putObject(self)
  broadcastToAll("Card Trashed")
end

function doNothing()
end

-- ===== Power Play 543c9a (2132 chars) =====
function onLoad()
   self.clearButtons()
   self.createButton({
    ['click_function'] = 'trashConfirm',
    ['label'] = 'Trash the Card?',
    ['function_owner'] = self,
    ['position'] = {0, 0.2, 0.3},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 800,
    ['height'] = 200,
    ['scale'] = {0.9,0.9,0.9},
    ['font_size'] = 75,
    ['font_color'] = {1, 1, 1}
,
    ['color'] = {0,0,0}
   })
end

function trashConfirm()
   self.clearButtons()
   self.createButton({
    ['click_function'] = 'doNothing',
    ['label'] = 'Are You Sure?',
    ['function_owner'] = self,
    ['position'] = {0, 0.2, 0.3},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 800,
    ['height'] = 200,
    ['scale'] = {0.9,0.9,0.9},
    ['font_size'] = 75,
    ['font_color'] = {1, 1, 1}
,
    ['color'] = {0,0,0}
   })
   self.createButton({
    ['click_function'] = 'trashCard',
    ['label'] = 'Yes',
    ['function_owner'] = self,
    ['position'] = {-0.2, 0.2, 0.6},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 150,
    ['height'] = 100,
    ['scale'] = {0.9,0.9,0.9},
    ['font_size'] = 75,
    ['font_color'] = {1, 1, 1}
,
    ['color'] = "Green"
   })
   self.createButton({
    ['click_function'] = 'holdCard',
    ['label'] = 'No',
    ['function_owner'] = self,
    ['position'] = {0.2, 0.2, 0.6},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 150,
    ['height'] = 100,
    ['scale'] = {0.9,0.9,0.9},
    ['font_size'] = 75,
    ['font_color'] = {1, 1, 1}
,
    ['color'] = "Red"
   })
end

function holdCard()
   self.clearButtons()
   self.createButton({
    ['click_function'] = 'trashConfirm',
    ['label'] = 'Trash the Card?',
    ['function_owner'] = self,
    ['position'] = {0, 0.2, 0.3},
    ['rotation'] =  {0, 0, 0},
    ['width'] = 800,
    ['height'] = 200,
    ['scale'] = {0.9,0.9,0.9},
    ['font_size'] = 75,
    ['font_color'] = {1, 1, 1}
,
    ['color'] = {0,0,0}
   })
end

function trashCard()
  self.clearButtons()
  getObjectFromGUID("288283").putObject(self)
  broadcastToAll("Card Trashed")
end

function doNothing()
end

-- ===== Custom_Tile 762934 (2258 chars) =====
--Counting Bowl    by MrStump
timerID = ""

validCountItemList = {
    ["5 Spice"] = 5,
    ["1 Spice"] = 1,
}

function onLoad()
    timerID = self.getGUID()..math.random(9999999999999)
    
    self.createButton({
        label="", click_function="none", function_owner=self,
        position={0,0,1.6}, rotation={0,0,0}, height=00, width=0,
        font_color={1,1,1}, font_size=250
    })
    
    Timer.create({
        identifier=timerID,
        function_name="countItems", function_owner=self,
        repetitions=0, delay=0.75
    })
end

--Activated once per second, counts items in bowls
function countItems()
    local totalValue = 0
    local itemsInBowl = findItemsInSphere()
    --Go through all items found by the cast
    for _, entry in ipairs(itemsInBowl) do
        --Ignore the bowl
        if entry.hit_object ~= self then
            local tableEntry = validCountItemList[entry.hit_object.getName()]
            --Ignore if not in validCountItemList
            if tableEntry ~= nil then
                local descValue = tonumber(entry.hit_object.getDescription())
                local stackMult = math.abs(entry.hit_object.getQuantity())
                --Use value in description if available
                if descValue ~= nil then
                    totalValue = totalValue + descValue * stackMult
                else
                    --Otherwise use the value in validCountItemList
                    totalValue = totalValue + tableEntry * stackMult
                end
            end
        end
    end
    --Updates the number display
    totalValue = (totalValue .. " Spice")
    self.editButton({index=0, label=totalValue})
end

--Gets the items in the bowl for countItems to count
function findItemsInSphere()
    --Find scaling factor
    local scale = self.getScale()
    --Set position for the sphere
    local pos = self.getPosition()
    --pos.y=pos.y+(1.25*scale.y)
    --Ray trace to get all objects
    return Physics.cast({
        origin=pos, direction={0,1,0}, type=2, max_distance=0,
        size={6*scale.x,6*scale.y,6*scale.z}, --debug=true
    })
end

function onDestroy()
  --if timerID ~= nil then
    --Timer.destroy(timerID)
  --end
end

-- ===== Custom_Tile 4fd595 (2258 chars) =====
--Counting Bowl    by MrStump
timerID = ""

validCountItemList = {
    ["5 Spice"] = 5,
    ["1 Spice"] = 1,
}

function onLoad()
    timerID = self.getGUID()..math.random(9999999999999)
    
    self.createButton({
        label="", click_function="none", function_owner=self,
        position={0,0,1.6}, rotation={0,0,0}, height=00, width=0,
        font_color={1,1,1}, font_size=250
    })
    
    Timer.create({
        identifier=timerID,
        function_name="countItems", function_owner=self,
        repetitions=0, delay=0.75
    })
end

--Activated once per second, counts items in bowls
function countItems()
    local totalValue = 0
    local itemsInBowl = findItemsInSphere()
    --Go through all items found by the cast
    for _, entry in ipairs(itemsInBowl) do
        --Ignore the bowl
        if entry.hit_object ~= self then
            local tableEntry = validCountItemList[entry.hit_object.getName()]
            --Ignore if not in validCountItemList
            if tableEntry ~= nil then
                local descValue = tonumber(entry.hit_object.getDescription())
                local stackMult = math.abs(entry.hit_object.getQuantity())
                --Use value in description if available
                if descValue ~= nil then
                    totalValue = totalValue + descValue * stackMult
                else
                    --Otherwise use the value in validCountItemList
                    totalValue = totalValue + tableEntry * stackMult
                end
            end
        end
    end
    --Updates the number display
    totalValue = (totalValue .. " Spice")
    self.editButton({index=0, label=totalValue})
end

--Gets the items in the bowl for countItems to count
function findItemsInSphere()
    --Find scaling factor
    local scale = self.getScale()
    --Set position for the sphere
    local pos = self.getPosition()
    --pos.y=pos.y+(1.25*scale.y)
    --Ray trace to get all objects
    return Physics.cast({
        origin=pos, direction={0,1,0}, type=2, max_distance=0,
        size={6*scale.x,6*scale.y,6*scale.z}, --debug=true
    })
end

function onDestroy()
  --if timerID ~= nil then
    --Timer.destroy(timerID)
  --end
end

-- ===== Custom_Tile 5df607 (2258 chars) =====
--Counting Bowl    by MrStump
timerID = ""

validCountItemList = {
    ["5 Spice"] = 5,
    ["1 Spice"] = 1,
}

function onLoad()
    timerID = self.getGUID()..math.random(9999999999999)
    
    self.createButton({
        label="", click_function="none", function_owner=self,
        position={0,0,1.6}, rotation={0,0,0}, height=00, width=0,
        font_color={1,1,1}, font_size=250
    })
    
    Timer.create({
        identifier=timerID,
        function_name="countItems", function_owner=self,
        repetitions=0, delay=0.75
    })
end

--Activated once per second, counts items in bowls
function countItems()
    local totalValue = 0
    local itemsInBowl = findItemsInSphere()
    --Go through all items found by the cast
    for _, entry in ipairs(itemsInBowl) do
        --Ignore the bowl
        if entry.hit_object ~= self then
            local tableEntry = validCountItemList[entry.hit_object.getName()]
            --Ignore if not in validCountItemList
            if tableEntry ~= nil then
                local descValue = tonumber(entry.hit_object.getDescription())
                local stackMult = math.abs(entry.hit_object.getQuantity())
                --Use value in description if available
                if descValue ~= nil then
                    totalValue = totalValue + descValue * stackMult
                else
                    --Otherwise use the value in validCountItemList
                    totalValue = totalValue + tableEntry * stackMult
                end
            end
        end
    end
    --Updates the number display
    totalValue = (totalValue .. " Spice")
    self.editButton({index=0, label=totalValue})
end

--Gets the items in the bowl for countItems to count
function findItemsInSphere()
    --Find scaling factor
    local scale = self.getScale()
    --Set position for the sphere
    local pos = self.getPosition()
    --pos.y=pos.y+(1.25*scale.y)
    --Ray trace to get all objects
    return Physics.cast({
        origin=pos, direction={0,1,0}, type=2, max_distance=0,
        size={6*scale.x,6*scale.y,6*scale.z}, --debug=true
    })
end

function onDestroy()
  --if timerID ~= nil then
    --Timer.destroy(timerID)
  --end
end

-- ===== Custom_Token 2da390 (46241 chars) =====
conflictZone = "02ca0a"
conflictDiscardZone = "4a21d4"
redSupply = {-49.00, 3.5, -22.00}
blueSupply = {-6.00, 3.5, -22.00}
orangeSupply = {6.00, 3.5, -22.00}
greenSupply = {49.00, 3.5, -22.00}
combatTrackZone = "94d0b4"
conflictCardZone = "df61c3"
spiceOneBag = "85289a"
firstPlayerToken = "784534"

playerBoards = {"a0fa97", "042887", "e435ab", "f8a49f"}

makerZones = {"a8f11b", "2cb52b", "139415"}

swordMasterTokens = {"ed3490", "a78ad7", "7549d5", "fb1629"}
swordMasterStart = {{-45.38, 2, -21.71}, {-19.99, 2, -21.85}, {9.94, 2, -21.94}, {34.73, 2, -21.96}}
swordMasterSpots = {{6.12, 1.08, 12.28}, {6.12, 1.08, 11.42}, {7.13, 1.08, 12.28}, {7.13, 1.08, 11.42}}
swordMasterSpotsIX = {{2.70, 1.36, 11.71}, {2.70, 1.36, 10.62}, {3.55, 1.36, 10.61}, {3.55, 1.36, 11.71}}
swordRot = {{0,180,0},{0,180,0},{0,180,0},{0,180,0}}

councilorSpots = {{-45.37, 2, -20.68}, {-19.99, 2, -20.83}, {9.94, 2, -20.91}, {34.72, 2, -20.93}}
councilorTokens = {"f19a48", "f5b14a", "5dd080", "a0028d"}

mentatToken = "e7e9b1"
mentatPosIX = {-0.78, 1.2, 11.17}

combatStrength = {{1.46, 2, -7.00}, {2.46, 2, -7.00}, {3.47, 2, -7.00}, {4.49, 2, -7.00}, {5.49, 2, -7.00}, {6.49, 2, -7.00}, {7.50, 2, -7.00}, {8.51, 2, -7.00}, {9.52, 2, -7.00}, {10.53, 2, -7.00}, {1.43, 2, -8.15}, {2.45, 2, -8.15}, {3.43, 2, -8.15}, {4.45, 2, -8.15}, {5.46, 2, -8.15}, {6.47, 2, -8.15}, {7.50, 2, -8.15}, {8.51, 2, -8.15}, {9.52, 2, -8.15}, {10.53, 2, -8.15}}
combatMarker = {"85d1f1", "a371fc", "f99579", "fff6c4"}

scoreTrack = {{12.05, 3, -8.15}, {12.04, 3, -6.83}, {12.04, 3, -5.53}, {12.06, 3, -4.19}, {12.06, 3, -2.92}, {12.06, 3, -1.59}, {12.05, 3, -0.30}, {12.05, 3, 1.07}, {12.06, 3, 2.38}, {12.08, 3, 3.67}, {12.09, 3, 4.99}, {12.12, 3, 6.28}, {12.13, 3, 7.62}}
scoreTokens = {"b14880", "380664", "388017", "0867e7"}

cardsDrawn = 0
difficultyLevel = 1
expertPlus = 0

buttonState = 0
conflictState = 0

defaultColorList = {"Red", "Blue", "Orange", "Green"}
selectedColors = {0,0,0,0}
selectionCheck = 0

function onLoad(saved_data_board)
  if saved_data_board ~= "" and saved_data_board ~= nil then
    local loaded_data = JSON.decode(saved_data_board)

    buttonState = loaded_data[1]
    conflictState = loaded_data[2]
  else
    buttonState = 0
    conflictState = 0
  end
end

function onSave()
  local bs = buttonState
  local cs = conflictState

  local data_to_save = {bs,cs}

  saved_data_board = JSON.encode(data_to_save)

  return saved_data_board
end

function loadButtonState()
  buttonRed = 195
  buttonGreen = 64
  buttonBlue = 1

  buttonRed = buttonRed/255
  buttonGreen = buttonGreen/255
  buttonBlue = buttonBlue/255

  self.createButton({
     click_function = "calculateConflict",
     function_owner = self,
     label          = "Calculate Initial Combat Strength",
     position       = {0.8,0.3,1.43},
     rotation       = {0, 0, 0},
     scale          = {0.2, 1, 0.2},
     width          = 1200,
     height         = 125,
     tooltip        = "",
     font_color     = {1, 1, 1},
     font_size      = 75,
     color          = {buttonRed, buttonGreen, buttonBlue},
     })

  if buttonState == 0 then
  self.createButton({
     click_function = "resetConflictZoneStart",
     function_owner = self,
     label          = "Reset Conflict Zone",
     position       = {0.8,0.3,0.33},
     rotation       = {0, 0, 0},
     scale          = {0.2, 1, 0.2},
     width          = 1800,
     height         = 225,
     tooltip        = "",
     font_color     = {1, 1, 1},
     font_size      = 175,
     color          = {buttonRed, buttonGreen, buttonBlue},
     })

  elseif buttonState == 1 then
  self.createButton({
     click_function = "makerPhase",
     function_owner = self,
     label          = "Execute Maker Phase",
     position       = {0.8,0.3,0.33},
     rotation       = {0, 0, 0},
     scale          = {0.2, 1, 0.2},
     width          = 1500,
     height         = 225,
     tooltip        = "",
     font_color     = {1, 1, 1},
     font_size      = 175,
     color          = {buttonRed, buttonGreen, buttonBlue},
     })

  elseif buttonState == 2 then
  self.createButton({
     click_function = "recallPhase",
     function_owner = self,
     label          = "Execute Recall Phase",
     position       = {0.8,0.3,0.33},
     rotation       = {0, 0, 0},
     scale          = {0.2, 1, 0.2},
     width          = 1800,
     height         = 225,
     tooltip        = "",
     font_color     = {1, 1, 1},
     font_size      = 175,
     color          = {buttonRed, buttonGreen, buttonBlue},
     })

  end

  if conflictState == 0 then
  self.createButton({
     click_function = "drawConflict",
     function_owner = self,
     label          = "Draw Conflict",
     position       = {-0.565,0.3,0.82},
     rotation       = {0, 0, 0},
     scale          = {0.2, 1, 0.2},
     width          = 600,
     height         = 80,
     tooltip        = "",
     font_color     = {1, 1, 1},
     font_size      = 60,
     color          = {buttonRed, buttonGreen, buttonBlue},
     })

  elseif conflictState == 1 then
  self.createButton({
     click_function = "drawConflict",
     function_owner = self,
     label          = "Draw Conflict",
     position       = {-0.565,0.3,0.82},
     rotation       = {0, 0, 0},
     scale          = {0.2, 1, 0.2},
     width          = 600,
     height         = 80,
     tooltip        = "",
     font_color     = {1, 1, 1},
     font_size      = 60,
     color          = {buttonRed, buttonGreen, buttonBlue},
     })
  self.createButton({
     click_function = "drawConflictTop",
     function_owner = self,
     label          = "[Draw Conflict]",
     position       = {-0.565,1.3,0.82},
     rotation       = {0, 0, 0},
     scale          = {0.2, 1, 0.2},
     width          = 600,
     height         = 80,
     tooltip        = "",
     font_color     = {1, 1, 1},
     font_size      = 60,
     color          = {buttonRed, buttonGreen, buttonBlue},
     })

  elseif conflictState == 2 then
  self.createButton({
     click_function = "drawConflict",
     function_owner = self,
     label          = "[Draw Conflict]",
     position       = {-0.565,0.3,0.82},
     rotation       = {0, 0, 0},
     scale          = {0.2, 1, 0.2},
     width          = 600,
     height         = 80,
     tooltip        = "",
     font_color     = {1, 1, 1},
     font_size      = 60,
     color          = {buttonRed, buttonGreen, buttonBlue},
     })
  elseif conflictState == 3 then
    --do nothing
  end

end

function conflictZoneSetup()
  buttonRed = 195
  buttonGreen = 64
  buttonBlue = 1

  buttonRed = buttonRed/255
  buttonGreen = buttonGreen/255
  buttonBlue = buttonBlue/255

  self.createButton({
     click_function = "drawConflict",
     function_owner = self,
     label          = "Draw Conflict",
     position       = {-0.565,0.3,0.82},
     rotation       = {0, 0, 0},
     scale          = {0.2, 1, 0.2},
     width          = 600,
     height         = 80,
     tooltip        = "",
     font_color     = {1, 1, 1},
     font_size      = 60,
     color          = {buttonRed, buttonGreen, buttonBlue},
     })
end

function conflictSetup()
  buttonRed = 195
  buttonGreen = 64
  buttonBlue = 1

  buttonRed = buttonRed/255
  buttonGreen = buttonGreen/255
  buttonBlue = buttonBlue/255

  self.createButton({
     click_function = "resetConflictZoneStart",
     function_owner = self,
     label          = "Reset Conflict Zone",
     position       = {0.8,0.3,0.33},
     rotation       = {0, 0, 0},
     scale          = {0.2, 1, 0.2},
     width          = 1800,
     height         = 225,
     tooltip        = "",
     font_color     = {1, 1, 1},
     font_size      = 175,
     color          = {buttonRed, buttonGreen, buttonBlue},
     })
  self.createButton({
     click_function = "calculateConflict",
     function_owner = self,
     label          = "Calculate Initial Combat Strength",
     position       = {0.8,0.3,1.43},
     rotation       = {0, 0, 0},
     scale          = {0.2, 1, 0.2},
     width          = 1200,
     height         = 125,
     tooltip        = "",
     font_color     = {1, 1, 1},
     font_size      = 75,
     color          = {buttonRed, buttonGreen, buttonBlue},
     })
end

function resetConflictZoneStart()
  startLuaCoroutine(self, "resetConflictZone")
end

function resetConflictZone()
  conflictArea = getObjectFromGUID(conflictZone).getObjects()

  for _, item in ipairs(conflictArea) do
    if item.tag == "Block" and item.getName() == "Red" then
      item.setPositionSmooth({redSupply[1] + (math.random()/2), redSupply[2], redSupply[3] + (math.random()/2)}, false, true)
    elseif item.tag == "Block" and item.getName() == "Blue" then
      item.setPositionSmooth({blueSupply[1] + (math.random()/2), blueSupply[2], blueSupply[3] + (math.random()/2)}, false, true)
    elseif item.tag == "Block" and item.getName() == "Orange" then
      item.setPositionSmooth({  orangeSupply[1] + (math.random()/2), orangeSupply[2], orangeSupply[3] + (math.random()/2)}, false, true)
    elseif item.tag == "Block" and item.getName() == "Green" then
      item.setPositionSmooth({  greenSupply[1] + (math.random()/2), greenSupply[2], greenSupply[3] + (math.random()/2)}, false, true)
    end

    local Time = os.clock() + 0.1
      while os.clock() < Time do
        coroutine.yield(0)
      end

  end

  combatTrack = getObjectFromGUID(combatTrackZone).getObjects()

  for _, token in ipairs(combatTrack) do
    if token.getName() == "Red Combat Marker" then
      token.setPositionSmooth({1.21, 2, -5.89})
      token.setRotationSmooth({0, 180, 0})
    elseif token.getName() == "Blue Combat Marker" then
      Wait.frames(function()
        token.setPositionSmooth({1.76, 2, -5.8})
        token.setRotationSmooth({0, 180, 0})
      end, 30)
    elseif token.getName() == "Orange Combat Marker" then
      Wait.frames(function()
        token.setPositionSmooth({2.32, 2, -5.89})
        token.setRotationSmooth({0, 180, 0})
      end, 60)
    elseif token.getName() == "Green Combat Marker" then
      Wait.frames(function()
        token.setPositionSmooth({2.88, 2, -5.89})
        token.setRotationSmooth({0, 180, 0})
      end, 90)
    end
  end

  buttons = {}
  buttonIndex = ""

  buttons = self.getButtons()
  if buttons != nil then
    for i, v in pairs(buttons) do
      if v.label == "Reset Conflict Zone" then
        buttonIndex = i-1
      end
    end
  end

  if buttonIndex != nil then
    self.removeButton(buttonIndex)
  end

  buttonRed = 195
  buttonGreen = 64
  buttonBlue = 1

  buttonRed = buttonRed/255
  buttonGreen = buttonGreen/255
  buttonBlue = buttonBlue/255

  self.createButton({
     click_function = "makerPhase",
     function_owner = self,
     label          = "Execute Maker Phase",
     position       = {0.8,0.3,0.33},
     rotation       = {0, 0, 0},
     scale          = {0.2, 1, 0.2},
     width          = 1800,
     height         = 225,
     tooltip        = "",
     font_color     = {1, 1, 1},
     font_size      = 175,
     color          = {buttonRed, buttonGreen, buttonBlue},
     })

  buttonState = 1

  return 1
end

function makerPhase()
  for i=1, 3 do
    local agentCheck = 0
    spaceCheck = getObjectFromGUID(makerZones[i]).getObjects()

    for _, item in ipairs(spaceCheck) do
      if item.getDescription() == "Agent" then
        agentCheck = 1
      end
    end

    if i == 1 and agentCheck == 0 then
      getObjectFromGUID(spiceOneBag).takeObject({position = {-1.19, 3, 0.25}, rotation = {0,180,0}})
    elseif i == 2 and agentCheck == 0 then
      getObjectFromGUID(spiceOneBag).takeObject({position = {5.26, 3, 3.05}, rotation = {0,180,0}})
    elseif i == 3 and agentCheck == 0 then
      getObjectFromGUID(spiceOneBag).takeObject({position = {10.12, 3, 4.48}, rotation = {0,180,0}})
    end
  end

  buttons = {}
  buttonIndex = ""

  buttons = self.getButtons()
  if buttons != nil then
    for i, v in pairs(buttons) do
      if v.label == "Execute Maker Phase" then
        buttonIndex = i-1
      end
    end
  end

  if buttonIndex != nil then
    self.removeButton(buttonIndex)
  end

  self.createButton({
     click_function = "recallPhase",
     function_owner = self,
     label          = "Execute Recall Phase",
     position       = {0.8,0.3,0.33},
     rotation       = {0, 0, 0},
     scale          = {0.2, 1, 0.2},
     width          = 1800,
     height         = 225,
     tooltip        = "",
     font_color     = {1, 1, 1},
     font_size      = 175,
     color          = {buttonRed, buttonGreen, buttonBlue},
     })

  buttonState = 2

end

function recallPhase()
  playerPingCount = 0
  playerCheck = Player.getPlayers()

  for _, playerPing in ipairs(playerCheck) do
    if playerPing.color == "Red" or playerPing.color == "Blue" or playerPing.color == "Orange" or playerPing.color == "Green" then
      playerPingCount = playerPingCount + 1
    end
  end

  local redSpot = 0
  local blueSpot = 0
  local orangeSpot = 0
  local greenSpot = 0

  --local rivalCheck = Global.getVar("rivals")
  local rivalCheck = selectedColors

  if getObjectFromGUID(firstPlayerToken).getVar("riseIX") == 1 then
    getObjectFromGUID(mentatToken).setPositionSmooth(mentatPosIX,false,true)
    getObjectFromGUID(mentatToken).setRotationSmooth({0,0,0})
  else
    getObjectFromGUID(mentatToken).setPositionSmooth({-0.84, 2, 11.74},false,true)
    getObjectFromGUID(mentatToken).setRotationSmooth({0,0,0})
  end


  --General Agent Reset
  --Red
  if getObjectFromGUID("afa978") then
    getObjectFromGUID("afa978").setPositionSmooth({-45.37, 2, -22.74},false,true)
    getObjectFromGUID("afa978").setRotationSmooth({0,180,0})
  end
  if getObjectFromGUID("7751c8") then
    getObjectFromGUID("7751c8").setPositionSmooth({-45.37, 2, -23.77},false,true)
    getObjectFromGUID("7751c8").setRotationSmooth({0,180,0})
  end
  --Blue
  if getObjectFromGUID("106d8b") then
    getObjectFromGUID("106d8b").setPositionSmooth({-19.99, 2, -22.88},false,true)
    getObjectFromGUID("106d8b").setRotationSmooth({0,180,0})
  end
  if getObjectFromGUID("64d013") then
    getObjectFromGUID("64d013").setPositionSmooth({-19.99, 2, -23.90},false,true)
    getObjectFromGUID("64d013").setRotationSmooth({0,180,0})
  end
  --Orange
  if getObjectFromGUID("72a073") then
    getObjectFromGUID("72a073").setPositionSmooth({9.93, 2, -22.96},false,true)
    getObjectFromGUID("72a073").setRotationSmooth({0,180,0})
  end
  if getObjectFromGUID("fbe4b4") then
    getObjectFromGUID("fbe4b4").setPositionSmooth({9.94, 2, -23.99},false,true)
    getObjectFromGUID("fbe4b4").setRotationSmooth({0,180,0})
  end
  --Green
  if getObjectFromGUID("bceb0e") then
    getObjectFromGUID("bceb0e").setPositionSmooth({34.72, 1.51, -22.98},false,true)
    getObjectFromGUID("bceb0e").setRotationSmooth({0,180,0})
  end
  if getObjectFromGUID("66ae45") then
    getObjectFromGUID("66ae45").setPositionSmooth({34.72, 2, -24.01},false,true)
    getObjectFromGUID("66ae45").setRotationSmooth({0,180,0})
  end

  local conflictDiscard = GetDeckOrCard("4a21d4")
  local discardCount = 0
  local rivalRecall = 0

  if conflictDiscard != nil then
   if conflictDiscard.name == "Deck" or conflictDiscard.name == "DeckCustom" then
    discardCount = conflictDiscard.getQuantity()
   elseif conflictDiscard.name == "Card" or conflictDiscard.name == "CardCustom" then
    discardCount = 1
   end
  end
  --local conflictDiscard = getObjectFromGUID("4a21d4").getObjects()

  rivalRecall = (6-difficultyLevel) - discardCount

  if getObjectFromGUID(firstPlayerToken).getVar("riseIX") == 1 then
    swordMasterSpots = {{2.68, 1.19, 11.71}, {2.70, 1.18, 10.62}, {3.55, 1.18, 10.61}, {3.55, 1.18, 11.71}}
  end

  for i=1,4 do
    if getObjectFromGUID(swordMasterTokens[i]) then
      local swordPos = getObjectFromGUID(swordMasterTokens[i]).getPosition()
      local comparePos = Vector(swordMasterSpots[i])
      local vectorCheck = Vector({14.08, 14.08, 14.08})

      if rivalCheck[i] != 1 and Vector.equals(swordPos, comparePos, 0.02) == false then
        if round(getObjectFromGUID(councilorTokens[i]).getPosition().z,2) != vectorCheck.z then
          getObjectFromGUID(councilorTokens[i]).setPositionSmooth(councilorSpots[i],false,true)
        end
        getObjectFromGUID(swordMasterTokens[i]).setPositionSmooth(swordMasterStart[i],false,true)
        getObjectFromGUID(swordMasterTokens[i]).setRotationSmooth(swordRot[i])
      elseif rivalCheck[i] == 1 and rivalRecall < 1 then
        if round(getObjectFromGUID(councilorTokens[i]).getPosition().z,2) != vectorCheck.z then
          getObjectFromGUID(councilorTokens[i]).setPositionSmooth(councilorSpots[i],false,true)
        end
        getObjectFromGUID(swordMasterTokens[i]).setPositionSmooth(swordMasterStart[i],false,true)
        getObjectFromGUID(swordMasterTokens[i]).setRotationSmooth(swordRot[i])
      end
    end
  end

  getObjectFromGUID("784534").call("passPlayer",{})
  if playerPingCount == 1 then
    getObjectFromGUID("f1a7d1").call("resetRivalStart",{})
  end

  --Tech tile top flip check
  if getObjectFromGUID(firstPlayerToken).getVar("riseIX") == 1 then
    getObjectFromGUID("ab1ce9").call("phaseTileCheck", {})
  end

  buttons = {}
  buttonIndex = ""

  buttons = self.getButtons()
  if buttons != nil then
    for i, v in pairs(buttons) do
      if v.label == "Execute Recall Phase" then
        buttonIndex = i-1
      end
    end
  end

  if buttonIndex != nil then
    self.removeButton(buttonIndex)
  end

  if conflictState != 3 then
    self.createButton({
      click_function = "resetConflictZoneStart",
      function_owner = self,
      label          = "Reset Conflict Zone",
      position       = {0.8,0.3,0.33},
      rotation       = {0, 0, 0},
      scale          = {0.2, 1, 0.2},
      width          = 1800,
      height         = 225,
      tooltip        = "",
      font_color     = {1, 1, 1},
      font_size      = 175,
      color          = {buttonRed, buttonGreen, buttonBlue},
      })
   else
     self.createButton({
        click_function = "doNothing",
        function_owner = self,
        label          = "Endgame Triggered",
        position       = {0.8,0.3,0.33},
        rotation       = {0, 0, 0},
        scale          = {0.2, 1, 0.2},
        width          = 1800,
        height         = 225,
        tooltip        = "",
        font_color     = {1, 1, 1},
        font_size      = 175,
        color          = {buttonRed, buttonGreen, buttonBlue},
        })
   end

  for i=1,4 do
    getObjectFromGUID(playerBoards[i]).call("discardReveals",{})
  end

  buttonState = 0

  if playerPingCount > 1 then
    drawConflict()
    broadcastToAll("New Conflict Card Drawn!")
  elseif playerPingCount == 1 then
    local newConflictCheck = GetDeckOrCard(conflictDiscardZone)
    if newConflictCheck.tag == "Deck" then
      if (6 - difficultyLevel) > newConflictCheck.getQuantity() then
        drawConflictTop()
        broadcastToAll("New Conflict Card Drawn!")
      else
        drawConflict()
        broadcastToAll("New Conflict Card Drawn!")
      end
    else
      drawConflictTop()
      broadcastToAll("New Conflict Card Drawn!")
    end
  end

  startLuaCoroutine(self, "playerHandRefresh")
end

function playerHandRefresh()
  local Time = os.clock() + 1
    while os.clock() < Time do
      coroutine.yield(0)
    end

  for _, playerPing in ipairs(playerCheck) do
    local handQuery = Player[playerPing.color].getHandObjects(1)
    local handCount = #handQuery

    local intrigueCount = 0

    for _, cardItem in ipairs(handQuery) do
      if cardItem.getDescription() == "Intrigue" then
        intrigueCount = intrigueCount + 1
      end
    end

    handCount = handCount - intrigueCount

    if handCount == 0 then
      if playerPing.color == "Red" then
        getObjectFromGUID(playerBoards[1]).call("drawHandStart",{})
      elseif playerPing.color == "Blue" then
        getObjectFromGUID(playerBoards[2]).call("drawHandStart",{})
      elseif playerPing.color == "Orange" then
        getObjectFromGUID(playerBoards[3]).call("drawHandStart",{})
      elseif playerPing.color == "Green" then
        getObjectFromGUID(playerBoards[4]).call("drawHandStart",{})
      end
    end
  end
  return 1
end

function round(num, dec)
    local mult = 10^(dec or 0)
    return math.floor(num * mult + 0.5) / mult
end

function drawConflict()
  conflictDeck = GetDeckOrCard(conflictCardZone)

  if conflictDeck != nil then
    if conflictDeck.tag == "Deck" then
      conflictDeck.takeObject({position = {-0.79, 2, -3.33}, flip = true})
    elseif conflictDeck.tag == "Card" then
      conflictDeck.flip()
      conflictDeck.setPositionSmooth({-0.79, 2, -3.33}, false,true)

    buttons = self.getButtons()
    if buttons != nil then
      for i, v in pairs(buttons) do
        if v.label == "[Draw Conflict]" then
          buttonIndex = i-1
        end
      end
    end
    if buttonIndex != nil then
      self.removeButton(buttonIndex)
    end

    buttons = self.getButtons()
    if buttons != nil then
      for i, v in pairs(buttons) do
        if v.label == "Draw Conflict" then
          buttonIndex = i-1
        end
      end
    end

    if buttonIndex != nil then
      self.removeButton(buttonIndex)
    end

    conflictState = 3

    end
  end
end

function GetDeckOrCard(zoneGUID)
  for _, obj in ipairs(getObjectFromGUID(zoneGUID).getObjects()) do
    if obj.name == "Card" or obj.name == "CardCustom" or obj.name == "Deck" or obj.name == "DeckCustom" then
      return obj
    end
  end

 return nil
end


function onePlayerSetup()
  buttonRed = 195
  buttonGreen = 64
  buttonBlue = 1

  buttonRed = buttonRed/255
  buttonGreen = buttonGreen/255
  buttonBlue = buttonBlue/255

  self.createButton({
     click_function = "doNothing",
     function_owner = self,
     label          = "Select Difficulty Level:",
     position       = {0,1.6,-1.1},
     rotation       = {0, 0, 0},
     scale          = {1, 1, 1},
     width          = 1,
     height         = 1,
     tooltip        = "",
     font_color     = {1, 1, 1},
     font_size      = 100,
     color          = {0,0,0}
     })
  self.createButton({
     click_function = "setLevelOne",
     function_owner = self,
     label          = "Mercenary",
     position       = {0,1.6,-0.75},
     rotation       = {0, 0, 0},
     scale          = {1, 1, 1},
     width          = 650,
     height         = 150,
     tooltip        = "",
     font_color     = {1, 1, 1},
     font_size      = 75,
     color          = {buttonRed, buttonGreen, buttonBlue},
     })
  self.createButton({
     click_function = "setLevelTwo",
     function_owner = self,
     label          = "Sardaukar",
     position       = {0,1.6,-0.4},
     rotation       = {0, 0, 0},
     scale          = {1, 1, 1},
     width          = 650,
     height         = 150,
     tooltip        = "",
     font_color     = {1, 1, 1},
     font_size      = 75,
     color          = {buttonRed, buttonGreen, buttonBlue},
     })
  self.createButton({
     click_function = "setLevelThree",
     function_owner = self,
     label          = "Mentat",
     position       = {0,1.6,-0.05},
     rotation       = {0, 0, 0},
     scale          = {1, 1, 1},
     width          = 650,
     height         = 150,
     tooltip        = "",
     font_color     = {1, 1, 1},
     font_size      = 75,
     color          = {buttonRed, buttonGreen, buttonBlue},
     })
  self.createButton({
     click_function = "setLevelFour",
     function_owner = self,
     label          = "Kwisatz Haderach",
     position       = {0,1.6,0.3},
     rotation       = {0, 0, 0},
     scale          = {1, 1, 1},
     width          = 650,
     height         = 150,
     tooltip        = "",
     font_color     = {1, 1, 1},
     font_size      = 75,
     color          = {buttonRed, buttonGreen, buttonBlue},
     })
end

function doNothing()
end

function setLevelOne()
  difficultyLevel = 1
  cleanMenu()
  conflictSetup()

  rivalSelection()

  --Global.call("onePlayerSetupContinue",{})
end

function setLevelTwo()
  difficultyLevel = 2
  cleanMenu()
  conflictSetup()

  rivalSelection()

  --Global.call("onePlayerSetupContinue",{})
end

function setLevelThree()
  difficultyLevel = 3
  cleanMenu()
  conflictSetup()

  rivalSelection()

  --Global.call("onePlayerSetupContinue",{})
end

function setLevelFour()
  difficultyLevel = 3
  expertPlus = 4
  cleanMenu()
  conflictSetup()

  rivalSelection()

  --Global.call("onePlayerSetupContinue",{})
end

function adjustConflictDraw()
  buttonRed = 195
  buttonGreen = 64
  buttonBlue = 1

  buttonRed = buttonRed/255
  buttonGreen = buttonGreen/255
  buttonBlue = buttonBlue/255

  self.createButton({
     click_function = "drawConflictTop",
     function_owner = self,
     label          = "[Draw Conflict]",
     position       = {-0.565,1.3,0.82},
     rotation       = {0, 0, 0},
     scale          = {0.2, 1, 0.2},
     width          = 600,
     height         = 80,
     tooltip        = "",
     font_color     = {1, 1, 1},
     font_size      = 60,
     color          = {buttonRed, buttonGreen, buttonBlue},
     })

  conflictState = 1
end

function drawConflictTop()
  buttonRed = 195
  buttonGreen = 64
  buttonBlue = 1

  buttonRed = buttonRed/255
  buttonGreen = buttonGreen/255
  buttonBlue = buttonBlue/255

  cardsDrawn = cardsDrawn + 1
  conflictDeck = GetDeckOrCard("cd9f53")

  local rivalCheck = Global.getVar("rivals")

  if conflictDeck != nil then
    if conflictDeck.tag == "Deck" then
      conflictDeck.takeObject({position = {-0.79, 2, -3.33}, flip = true})
    elseif conflictDeck.tag == "Card" then
      conflictDeck.flip()
      conflictDeck.setPositionSmooth({-0.79, 2, -3.33}, false,true)
    end
  end

  if cardsDrawn == (6 - difficultyLevel) then
    buttons = self.getButtons()
    if buttons != nil then
      for i, v in pairs(buttons) do
        if v.label == "[Draw Conflict]" then
          buttonIndex = i-1
        end
      end
    end
    self.removeButton(buttonIndex)
    --self.removeButton(2)
    buttons = self.getButtons()
    if buttons != nil then
      for i, v in pairs(buttons) do
        if v.label == "Draw Conflict" then
          buttonIndex = i-1
        end
      end
    end
    self. editButton({index=buttonIndex, label="[Draw Conflict]"})
    conflictState = 2

    for i=1,4 do
      if getObjectFromGUID(swordMasterTokens[i]) then

      local swordPos = getObjectFromGUID(swordMasterTokens[i]).getPosition()
      local comparePos = Vector(swordMasterSpots[i])
      local vectorCheck = Vector({11.43, 11.43, 11.43})

        if rivalCheck[i] == 1 then
          if round(getObjectFromGUID(councilorTokens[i]).getPosition().z,2) != vectorCheck.z then
            getObjectFromGUID(councilorTokens[i]).setPositionSmooth(councilorSpots[i],false,true)
          end
          getObjectFromGUID(swordMasterTokens[i]).setPositionSmooth(swordMasterStart[i],false,true)
          getObjectFromGUID(swordMasterTokens[i]).setRotationSmooth(swordRot[i])
        end
      end
    end

  end
end

function cleanMenu()
  buttons = self.getButtons()
  if buttons != nil then
    for i, v in pairs(buttons) do
      if v.label == "Select Difficulty Level:" then
        buttonIndex = i-1
      end
    end
  end
  self.removeButton(buttonIndex)
  buttons = self.getButtons()
  if buttons != nil then
    for i, v in pairs(buttons) do
      if v.label == "Mercenary" then
        buttonIndex = i-1
      end
    end
  end
  self.removeButton(buttonIndex)
  buttons = self.getButtons()
  if buttons != nil then
    for i, v in pairs(buttons) do
      if v.label == "Sardaukar" then
        buttonIndex = i-1
      end
    end
  end
  self.removeButton(buttonIndex)
  buttons = self.getButtons()
  if buttons != nil then
    for i, v in pairs(buttons) do
      if v.label == "Mentat" then
        buttonIndex = i-1
      end
    end
  end
  self.removeButton(buttonIndex)
  buttons = self.getButtons()
  if buttons != nil then
    for i, v in pairs(buttons) do
      if v.label == "Kwisatz Haderach" then
        buttonIndex = i-1
      end
    end
  end
  self.removeButton(buttonIndex)
end

function calculateConflict(GO, color)

  local playerPingCount = 0
  local playerCheck = Player.getPlayers()

  for _, playerPing in ipairs(playerCheck) do
    if playerPing.color == "Red" or playerPing.color == "Blue" or playerPing.color == "Orange" or playerPing.color == "Green" then
      playerPingCount = playerPingCount + 1
    end
  end

  local redTotal = 0
  local blueTotal = 0
  local orangeTotal = 0
  local greenTotal = 0

  local combatTokens = getObjectFromGUID("02ca0a").getObjects()

  for _, item in ipairs(combatTokens) do
    if item.tag == "Block" then
      if item.getName() == "Red" then
        redTotal = redTotal + 2
      elseif item.getName() == "Blue" then
        blueTotal = blueTotal + 2
      elseif item.getName() == "Orange" then
        orangeTotal = orangeTotal + 2
      elseif item.getName() == "Green" then
        greenTotal = greenTotal + 2
      end
    elseif item.getName() == "Red Dreadnought" then
      redTotal = redTotal + 3
    elseif item.getName() == "Blue Dreadnought" then
      blueTotal = blueTotal + 3
    elseif item.getName() == "Orange Dreadnought" then
      orangeTotal = orangeTotal + 3
    elseif item.getName() == "Green Dreadnought" then
      greenTotal = greenTotal + 3
    end
  end

  if playerPingCount > 1 then

  if redTotal > 0 and color == "Red" then
    if redTotal < 21 then
      getObjectFromGUID(combatMarker[1]).setRotationSmooth({0,180,0})
    end
    if redTotal > 20 then
        redTotal = redTotal - 20
        getObjectFromGUID(combatMarker[1]).setRotationSmooth({0,180,180})
    end
    getObjectFromGUID(combatMarker[1]).setPositionSmooth(combatStrength[redTotal],false,true)
  end
  if blueTotal > 0 and color == "Blue" then
    if blueTotal < 21 then
      getObjectFromGUID(combatMarker[2]).setRotationSmooth({0,180,0})
    end
    if blueTotal > 20 then
        blueTotal = blueTotal - 20
        getObjectFromGUID(combatMarker[2]).setRotationSmooth({0,180,180})
    end
    getObjectFromGUID(combatMarker[2]).setPositionSmooth(combatStrength[blueTotal],false,true)
  end
  if orangeTotal > 0 and color == "Orange" then
    if orangeTotal < 21 then
      getObjectFromGUID(combatMarker[3]).setRotationSmooth({0,180,0})
    end
    if orangeTotal > 20 then
        orangeTotal = orangeTotal - 20
        getObjectFromGUID(combatMarker[3]).setRotationSmooth({0,180,180})
    end
    getObjectFromGUID(combatMarker[3]).setPositionSmooth(combatStrength[orangeTotal],false,true)
  end
  if greenTotal > 0 and color == "Green" then
    if greenTotal < 21 then
      getObjectFromGUID(combatMarker[4]).setRotationSmooth({0,180,0})
    end
    if greenTotal > 20 then
        greenTotal = greenTotal - 20
        getObjectFromGUID(combatMarker[4]).setRotationSmooth({0,180,180})
    end
    getObjectFromGUID(combatMarker[4]).setPositionSmooth(combatStrength[greenTotal],false,true)
  end

  else

  if redTotal > 0 then
    if redTotal < 21 then
      getObjectFromGUID(combatMarker[1]).setRotationSmooth({0,180,0})
    end
    if redTotal > 20 then
        redTotal = redTotal - 20
        getObjectFromGUID(combatMarker[1]).setRotationSmooth({0,180,180})
    end
    getObjectFromGUID(combatMarker[1]).setPositionSmooth(combatStrength[redTotal],false,true)
  end
  if blueTotal > 0 then
    if blueTotal < 21 then
      getObjectFromGUID(combatMarker[2]).setRotationSmooth({0,180,0})
    end
    if blueTotal > 20 then
        blueTotal = blueTotal - 20
        getObjectFromGUID(combatMarker[2]).setRotationSmooth({0,180,180})
    end
    getObjectFromGUID(combatMarker[2]).setPositionSmooth(combatStrength[blueTotal],false,true)
  end
  if orangeTotal > 0 then
    if orangeTotal < 21 then
      getObjectFromGUID(combatMarker[3]).setRotationSmooth({0,180,0})
    end
    if orangeTotal > 20 then
        orangeTotal = orangeTotal - 20
        getObjectFromGUID(combatMarker[3]).setRotationSmooth({0,180,180})
    end
    getObjectFromGUID(combatMarker[3]).setPositionSmooth(combatStrength[orangeTotal],false,true)
  end
  if greenTotal > 0 then
    if greenTotal < 21 then
      getObjectFromGUID(combatMarker[4]).setRotationSmooth({0,180,0})
    end
    if greenTotal > 20 then
        greenTotal = greenTotal - 20
        getObjectFromGUID(combatMarker[4]).setRotationSmooth({0,180,180})
    end
    getObjectFromGUID(combatMarker[4]).setPositionSmooth(combatStrength[greenTotal],false,true)
  end

  end

end

function rivalSelection()
  local availableColors = {1,1,1,1}
  playerCheck = Player.getPlayers()

  for _, playerPing in ipairs(playerCheck) do
    if playerPing.color == "Red" then
      availableColors[1] = 0
    elseif playerPing.color == "Blue" then
      availableColors[2] = 0
    elseif playerPing.color == "Orange" then
      availableColors[3] = 0
    elseif playerPing.color == "Green" then
      availableColors[4] = 0
    end
  end


  self.createButton({
     click_function = "doNothing",
     function_owner = self,
     label          = "Select Rival Colors:",
     position       = {0,1,-1.1},
     rotation       = {0, 0, 0},
     scale          = {1, 1, 1},
     width          = 1,
     height         = 1,
     tooltip        = "",
     font_color     = {1, 1, 1},
     font_size      = 100,
     color          = {0,0,0}
     })

  local buttonOffset = -0.85
  for i=1, 4 do
    if availableColors[i] == 1 then
     self.createButton({
     click_function = "selectColor" .. defaultColorList[i],
     function_owner = self,
     label          = defaultColorList[i],
     position       = {0+buttonOffset,1,-0.75},
     rotation       = {0, 0, 0},
     scale          = {1, 1, 1},
     width          = 375,
     height         = 125,
     tooltip        = "",
     font_color     = {1, 1, 1},
     font_size      = 65,
     color          = defaultColorList[i],
     })
     buttonOffset= buttonOffset + 0.85
    end
  end

  self.createButton({
     click_function = "selectionConfirmation",
     function_owner = self,
     label          = "Confirm Selection?",
     position       = {0,1,-0.05},
     rotation       = {0, 0, 0},
     scale          = {1, 1, 1},
     width          = 700,
     height         = 150,
     tooltip        = "",
     font_color     = {1, 1, 1},
     font_size      = 75,
     color          = {0,0,0},
     })

end

function selectColorRed()
  if selectedColors[1] == 0 and selectionCheck < 2 then
    selectedColors[1] = 1
    buttons = self.getButtons()
    if buttons != nil then
      for i, v in pairs(buttons) do
        if v.label == "Red" then
          buttonIndex = i-1
        end
      end
    end
    self.editButton({index=buttonIndex, label="Red [x]"})
    selectionCheck = selectionCheck + 1
  elseif selectedColors[1] == 1 then
    selectedColors[1] = 0
    buttons = self.getButtons()
    if buttons != nil then
      for i, v in pairs(buttons) do
        if v.label == "Red [x]" then
          buttonIndex = i-1
        end
      end
    end
    self.editButton({index=buttonIndex, label="Red"})
    selectionCheck = selectionCheck - 1
  end
end

function selectColorBlue()
  if selectedColors[2] == 0 and selectionCheck < 2 then
    selectedColors[2] = 1
    buttons = self.getButtons()
    if buttons != nil then
      for i, v in pairs(buttons) do
        if v.label == "Blue" then
          buttonIndex = i-1
        end
      end
    end
    self.editButton({index=buttonIndex, label="Blue [x]"})
    selectionCheck = selectionCheck + 1
  elseif selectedColors[2] == 1 then
    selectedColors[2] = 0
    buttons = self.getButtons()
    if buttons != nil then
      for i, v in pairs(buttons) do
        if v.label == "Blue [x]" then
          buttonIndex = i-1
        end
      end
    end
    self.editButton({index=buttonIndex, label="Blue"})
    selectionCheck = selectionCheck - 1
  end
end

function selectColorOrange()
  if selectedColors[3] == 0 and selectionCheck < 2 then
    selectedColors[3] = 1
    buttons = self.getButtons()
    if buttons != nil then
      for i, v in pairs(buttons) do
        if v.label == "Orange" then
          buttonIndex = i-1
        end
      end
    end
    self.editButton({index=buttonIndex, label="Orange [x]"})
    selectionCheck = selectionCheck + 1
  elseif selectedColors[3] == 1 then
    selectedColors[3] = 0
    buttons = self.getButtons()
    if buttons != nil then
      for i, v in pairs(buttons) do
        if v.label == "Orange [x]" then
          buttonIndex = i-1
        end
      end
    end
    self.editButton({index=buttonIndex, label="Orange"})
    selectionCheck = selectionCheck - 1
  end
end
function selectColorGreen()
  if selectedColors[4] == 0 and selectionCheck < 2 then
    selectedColors[4] = 1
    buttons = self.getButtons()
    if buttons != nil then
      for i, v in pairs(buttons) do
        if v.label == "Green" then
          buttonIndex = i-1
        end
      end
    end
    self.editButton({index=buttonIndex, label="Green [x]"})
    selectionCheck = selectionCheck + 1
  elseif selectedColors[4] == 1 then
    selectedColors[4] = 0
    buttons = self.getButtons()
    if buttons != nil then
      for i, v in pairs(buttons) do
        if v.label == "Green [x]" then
          buttonIndex = i-1
        end
      end
    end
    self.editButton({index=buttonIndex, label="Green"})
    selectionCheck = selectionCheck - 1
  end
end

function selectionConfirmation()
  if selectionCheck == 2 then
    removeColorMenu()
      Global.call("onePlayerSetupContinue",{})
  else
    broadcastToAll("Select Two Rival Colors to Continue!")
  end
end

function removeColorMenu()
  buttons = self.getButtons()
  if buttons != nil then
    for i, v in pairs(buttons) do
      if v.label == "Select Rival Colors:" then
        buttonIndex = i-1
      end
    end
  end
  self.removeButton(buttonIndex)
  buttons = self.getButtons()
  if buttons != nil then
    for i, v in pairs(buttons) do
      if v.label == "Red" then
        buttonIndex = i-1
      end
    end
  end
  self.removeButton(buttonIndex)
  buttons = self.getButtons()
  if buttons != nil then
    for i, v in pairs(buttons) do
      if v.label == "Red [x]" then
        buttonIndex = i-1
      end
    end
  end
  self.removeButton(buttonIndex)
  buttons = self.getButtons()
  if buttons != nil then
    for i, v in pairs(buttons) do
      if v.label == "Blue" then
        buttonIndex = i-1
      end
    end
  end
  self.removeButton(buttonIndex)
  buttons = self.getButtons()
  if buttons != nil then
    for i, v in pairs(buttons) do
      if v.label == "Blue [x]" then
        buttonIndex = i-1
      end
    end
  end
  self.removeButton(buttonIndex)
  buttons = self.getButtons()
  if buttons != nil then
    for i, v in pairs(buttons) do
      if v.label == "Orange" then
        buttonIndex = i-1
      end
    end
  end
  self.removeButton(buttonIndex)
  buttons = self.getButtons()
  if buttons != nil then
    for i, v in pairs(buttons) do
      if v.label == "Orange [x]" then
        buttonIndex = i-1
      end
    end
  end
  self.removeButton(buttonIndex)
  buttons = self.getButtons()
  if buttons != nil then
    for i, v in pairs(buttons) do
      if v.label == "Green" then
        buttonIndex = i-1
      end
    end
  end
  self.removeButton(buttonIndex)
  buttons = self.getButtons()
  if buttons != nil then
    for i, v in pairs(buttons) do
      if v.label == "Green [x]" then
        buttonIndex = i-1
      end
    end
  end
  self.removeButton(buttonIndex)
  buttons = self.getButtons()
  if buttons != nil then
    for i, v in pairs(buttons) do
      if v.label == "Confirm Selection?" then
        buttonIndex = i-1
      end
    end
  end
  self.removeButton(buttonIndex)
end

function changeScore()
  local buttonOffset = 0
  local rivals = Global.getVar("rivals")
  local playSeat = Global.getVar("playSeat")

  for i=1, 4 do
    if rivals[i] == 1 or playSeat[i] == 1 then
     self.createButton({
      click_function = "up" .. defaultColorList[i],
      function_owner = self,
      label          = "+1",
      position       = {2+buttonOffset,0.2,-0.35},
      rotation       = {0, 0, 0},
      scale          = {0.5, 0.5, 0.5},
      width          = 150,
      height         = 100,
      tooltip        = "",
      font_color     = {1, 1, 1},
      font_size      = 65,
      color          = {0,0,0},
     })
     self.createButton({
      click_function = "doNothing",
      function_owner = self,
      label          = "VP",
      --label          = defaultColorList[i],
      position       = {2+buttonOffset,0.2,-0.20},
      rotation       = {0, 0, 0},
      scale          = {0.5, 0.5, 0.5},
      width          = 200,
      height         = 125,
      tooltip        = "",
      font_color     = {1, 1, 1},
      font_size      = 65,
      color          = defaultColorList[i],
     })
     self.createButton({
      click_function = "down" .. defaultColorList[i],
      function_owner = self,
      label          = "-1",
      position       = {2+buttonOffset,0.2,-0.05},
      rotation       = {0, 0, 0},
      scale          = {0.5, 0.5, 0.5},
      width          = 150,
      height         = 100,
      tooltip        = "",
      font_color     = {1, 1, 1},
      font_size      = 65,
      color          = {0,0,0},
     })
     buttonOffset= buttonOffset + 0.25
    end
  end

end

function upRed()
  local scorePos = getObjectFromGUID(scoreTokens[1]).getPosition()
  --local scoreSpot = 1

  for i=1,13 do
    if round(scorePos.x,2) == scoreTrack[i][1] and round(scorePos.z,2) == scoreTrack[i][3] then
      scoreSpot = i
    end
  end

  if scoreSpot != nil then
    scoreSpot = scoreSpot + 1
  end
  if scoreSpot == 14 then
    scoreSpot = 13
  end
  if scoreSpot != nil then
    getObjectFromGUID(scoreTokens[1]).setPositionSmooth(scoreTrack[scoreSpot],false,true)
  end

end

function downRed()
  local scorePos = getObjectFromGUID(scoreTokens[1]).getPosition()
  --local scoreSpot = 0

  for i=1,13 do
    if round(scorePos.x,2) == scoreTrack[i][1] and round(scorePos.z,2) == scoreTrack[i][3] then
      scoreSpot = i
    end
  end

  if scoreSpot != nil then
    scoreSpot = scoreSpot - 1
  end
  if scoreSpot == 0 then
    scoreSpot = 1
  end
  if scoreSpot != nil then
    getObjectFromGUID(scoreTokens[1]).setPositionSmooth(scoreTrack[scoreSpot],false,true)
  end

end

function upBlue()
  local scorePos = getObjectFromGUID(scoreTokens[2]).getPosition()
  --local scoreSpot = 1

  for i=1,13 do
    if round(scorePos.x,2) == scoreTrack[i][1] and round(scorePos.z,2) == scoreTrack[i][3] then
      scoreSpot = i
    end
  end
  if scoreSpot != nil then
    scoreSpot = scoreSpot + 1
  end
  if scoreSpot == 14 then
    scoreSpot = 13
  end
  if scoreSpot != nil then
    getObjectFromGUID(scoreTokens[2]).setPositionSmooth({scoreTrack[scoreSpot][1], (scoreTrack[scoreSpot][2] + 0.35), scoreTrack[scoreSpot][3]},false,true)
  end

end

function downBlue()
  local scorePos = getObjectFromGUID(scoreTokens[2]).getPosition()
  --local scoreSpot = 0

  for i=1,13 do
    if round(scorePos.x,2) == scoreTrack[i][1] and round(scorePos.z,2) == scoreTrack[i][3] then
      scoreSpot = i
    end
  end

  if scoreSpot != nil then
    scoreSpot = scoreSpot - 1
  end
  if scoreSpot == 0 then
    scoreSpot = 1
  end

  if scoreSpot != nil then
    getObjectFromGUID(scoreTokens[2]).setPositionSmooth({scoreTrack[scoreSpot][1], (scoreTrack[scoreSpot][2] + 0.35), scoreTrack[scoreSpot][3]},false,true)
  end

end

function upOrange()
  local scorePos = getObjectFromGUID(scoreTokens[3]).getPosition()
  --local scoreSpot = 1

  for i=1,13 do
    if round(scorePos.x,2) == scoreTrack[i][1] and round(scorePos.z,2) == scoreTrack[i][3] then
      scoreSpot = i
    end
  end

  if scoreSpot != nil then
    scoreSpot = scoreSpot + 1
  end
  if scoreSpot == 14 then
    scoreSpot = 13
  end
  if scoreSpot != nil then
    getObjectFromGUID(scoreTokens[3]).setPositionSmooth({scoreTrack[scoreSpot][1], (scoreTrack[scoreSpot][2] + 0.70), scoreTrack[scoreSpot][3]},false,true)
  end

end

function downOrange()
  local scorePos = getObjectFromGUID(scoreTokens[3]).getPosition()
  --local scoreSpot = 0

  for i=1,13 do
    if round(scorePos.x,2) == scoreTrack[i][1] and round(scorePos.z,2) == scoreTrack[i][3] then
      scoreSpot = i
    end
  end
  if scoreSpot != nil then
    scoreSpot = scoreSpot - 1
  end
  if scoreSpot == 0 then
    scoreSpot = 1
  end

  if scoreSpot != nil then
    getObjectFromGUID(scoreTokens[3]).setPositionSmooth({scoreTrack[scoreSpot][1], (scoreTrack[scoreSpot][2] + 0.70), scoreTrack[scoreSpot][3]},false,true)
  end

end

function upGreen()
  local scorePos = getObjectFromGUID(scoreTokens[4]).getPosition()
  --local scoreSpot = 1

  for i=1,13 do
    if round(scorePos.x,2) == scoreTrack[i][1] and round(scorePos.z,2) == scoreTrack[i][3] then
      scoreSpot = i
    end
  end

  if scoreSpot != nil then
    scoreSpot = scoreSpot + 1
  end
  if scoreSpot == 14 then
    scoreSpot = 13
  end
  if scoreSpot != nil then
    getObjectFromGUID(scoreTokens[4]).setPositionSmooth({scoreTrack[scoreSpot][1], (scoreTrack[scoreSpot][2] + 1.05), scoreTrack[scoreSpot][3]},false,true)
  end

end

function downGreen()
  local scorePos = getObjectFromGUID(scoreTokens[4]).getPosition()
  --local scoreSpot = 0

  for i=1,13 do
    if round(scorePos.x,2) == scoreTrack[i][1] and round(scorePos.z,2) == scoreTrack[i][3] then
      scoreSpot = i
    end
  end
  if scoreSpot != nil then
    scoreSpot = scoreSpot - 1
  end
  if scoreSpot == 0 then
    scoreSpot = 1
  end
  if scoreSpot != nil then
    getObjectFromGUID(scoreTokens[4]).setPositionSmooth({scoreTrack[scoreSpot][1], (scoreTrack[scoreSpot][2] + 1.05), scoreTrack[scoreSpot][3]},false,true)
  end

end

-- ===== CardCustom b4dfe2 (1341 chars) =====
playerBoards = {"a0fa97", "042887", "e435ab", "f8a49f"}
defaultColorList = {"Red", "Blue", "Orange", "Green"}

function onCollisionEnter(info)
  local playerSpot = 0
  local mentatColor = ""
  if info.collision_object.getDescription() == "Agent" then
    if info.collision_object.getName() == "Mentat" then
      mentatColor = getObjectFromGUID("e7e9b1").getVar("playerColor")
    end
    if mentatColor == "Red" or info.collision_object.getName() == "Red Agent" or info.collision_object.getName() == "Red Swordmaster" then
      playerSpot = 1
    elseif mentatColor == "Blue" or info.collision_object.getName() == "Blue Agent" or info.collision_object.getName() == "Blue Swordmaster" then
      playerSpot = 2
    elseif mentatColor == "Orange" or info.collision_object.getName() == "Orange Agent" or info.collision_object.getName() == "Orange Swordmaster" then
      playerSpot = 3
    elseif mentatColor == "Green" or info.collision_object.getName() == "Green Agent" or info.collision_object.getName() == "Green Swordmaster" then
      playerSpot = 4
    end

    if playerSpot != 0 and Global.getVar("rivals")[playerSpot] != 1 then
      getObjectFromGUID(playerBoards[playerSpot]).call("takeWater",{})
      broadcastToAll(defaultColorList[playerSpot] .. " Player May Send Troops to the Conflict Space")
    end
  end
end

-- ===== CardCustom 18295d (1631 chars) =====
playerBoards = {"a0fa97", "042887", "e435ab", "f8a49f"}
defaultColorList = {"Red", "Blue", "Orange", "Green"}
playerSpot = 0

function onCollisionEnter(info)
  playerSpot = 0
  local mentatColor = ""
  if info.collision_object.getDescription() == "Agent" then
    if info.collision_object.getName() == "Mentat" then
      mentatColor = getObjectFromGUID("e7e9b1").getVar("playerColor")
    end
    if mentatColor == "Red" or info.collision_object.getName() == "Red Agent" or info.collision_object.getName() == "Red Swordmaster" then
      playerSpot = 1
    elseif mentatColor == "Blue" or info.collision_object.getName() == "Blue Agent" or info.collision_object.getName() == "Blue Swordmaster" then
      playerSpot = 2
    elseif mentatColor == "Orange" or info.collision_object.getName() == "Orange Agent" or info.collision_object.getName() == "Orange Swordmaster" then
      playerSpot = 3
    elseif mentatColor == "Green" or info.collision_object.getName() == "Green Agent" or info.collision_object.getName() == "Green Swordmaster" then
      playerSpot = 4
    end

    if playerSpot != 0 and Global.getVar("rivals")[playerSpot] != 1 then
      startLuaCoroutine(self, "boardAction")
      broadcastToAll(defaultColorList[playerSpot] .. " Player May Send Troops to the Conflict Space")
    end
  end
end

function boardAction()
  getObjectFromGUID(playerBoards[playerSpot]).call("spendWater",{})

  for i=1, 2 do
    getObjectFromGUID(playerBoards[playerSpot]).call("addGarrison",{})

    local Time = os.clock() + 0.5
     while os.clock() < Time do
       coroutine.yield(0)
     end
  end
  return 1
end

-- ===== CardCustom 7b9727 (1431 chars) =====
playerBoards = {"a0fa97", "042887", "e435ab", "f8a49f"}
defaultColorList = {"Red", "Blue", "Orange", "Green"}

function onCollisionEnter(info)
  local playerSpot = 0
  local mentatColor = ""
  if info.collision_object.getDescription() == "Agent" then
    if info.collision_object.getName() == "Mentat" then
      mentatColor = getObjectFromGUID("e7e9b1").getVar("playerColor")
    end
    if mentatColor == "Red" or info.collision_object.getName() == "Red Agent" or info.collision_object.getName() == "Red Swordmaster" then
      playerSpot = 1
    elseif mentatColor == "Blue" or info.collision_object.getName() == "Blue Agent" or info.collision_object.getName() == "Blue Swordmaster" then
      playerSpot = 2
    elseif mentatColor == "Orange" or info.collision_object.getName() == "Orange Agent" or info.collision_object.getName() == "Orange Swordmaster" then
      playerSpot = 3
    elseif mentatColor == "Green" or info.collision_object.getName() == "Green Agent" or info.collision_object.getName() == "Green Swordmaster" then
      playerSpot = 4
    end

    if playerSpot != 0 and Global.getVar("rivals")[playerSpot] != 1 then
      params = {defaultColorList[playerSpot]}
      getObjectFromGUID("7962b9").call("intrigueBoardDraw",{params})
      broadcastToAll("Any oppenent that has 4 or more Intrigue cards, must randomly give one to the " .. defaultColorList[playerSpot] .. " Player")
    end
  end
end

-- ===== CardCustom 9462c8 (1570 chars) =====
playerBoards = {"a0fa97", "042887", "e435ab", "f8a49f"}
defaultColorList = {"Red", "Blue", "Orange", "Green"}

playerSpot = 0

function onCollisionEnter(info)
  playerSpot = 0
  local mentatColor = ""
  if info.collision_object.getDescription() == "Agent" then
    if info.collision_object.getName() == "Mentat" then
      mentatColor = getObjectFromGUID("e7e9b1").getVar("playerColor")
    end
    if mentatColor == "Red" or info.collision_object.getName() == "Red Agent" or info.collision_object.getName() == "Red Swordmaster" then
      playerSpot = 1
    elseif mentatColor == "Blue" or info.collision_object.getName() == "Blue Agent" or info.collision_object.getName() == "Blue Swordmaster" then
      playerSpot = 2
    elseif mentatColor == "Orange" or info.collision_object.getName() == "Orange Agent" or info.collision_object.getName() == "Orange Swordmaster" then
      playerSpot = 3
    elseif mentatColor == "Green" or info.collision_object.getName() == "Green Agent" or info.collision_object.getName() == "Green Swordmaster" then
      playerSpot = 4
    end

    if playerSpot != 0 and Global.getVar("rivals")[playerSpot] != 1 then
      startLuaCoroutine(self, "boardAction")
      broadcastToAll(defaultColorList[playerSpot] .. " Player - Trash 1 card and Draw 2 new cards")
    end
  end
end


function boardAction()
  for i=1, 2 do
    getObjectFromGUID(playerBoards[playerSpot]).call("spendOneSpice",{})

    local Time = os.clock() + 1.0
     while os.clock() < Time do
       coroutine.yield(0)
     end
  end
  return 1
end

-- ===== CardCustom fc31e6 (1284 chars) =====
playerBoards = {"a0fa97", "042887", "e435ab", "f8a49f"}
defaultColorList = {"Red", "Blue", "Orange", "Green"}

function onCollisionEnter(info)
  playerSpot = 0
  local mentatColor = ""
  if info.collision_object.getDescription() == "Agent" then
    if info.collision_object.getName() == "Mentat" then
      mentatColor = getObjectFromGUID("e7e9b1").getVar("playerColor")
    end
    if mentatColor == "Red" or info.collision_object.getName() == "Red Agent" or info.collision_object.getName() == "Red Swordmaster" then
      playerSpot = 1
    elseif mentatColor == "Blue" or info.collision_object.getName() == "Blue Agent" or info.collision_object.getName() == "Blue Swordmaster" then
      playerSpot = 2
    elseif mentatColor == "Orange" or info.collision_object.getName() == "Orange Agent" or info.collision_object.getName() == "Orange Swordmaster" then
      playerSpot = 3
    elseif mentatColor == "Green" or info.collision_object.getName() == "Green Agent" or info.collision_object.getName() == "Green Swordmaster" then
      playerSpot = 4
    end

    if playerSpot != 0 and Global.getVar("rivals")[playerSpot] != 1 then
      params = {defaultColorList[playerSpot]}
      getObjectFromGUID("7962b9").call("cardAquireBoardFoldspace",{params})
    end
  end
end

-- ===== CardCustom 2a4de1 (2259 chars) =====
playerBoards = {"a0fa97", "042887", "e435ab", "f8a49f"}
defaultColorList = {"Red", "Blue", "Orange", "Green"}

playerBoards = {"a0fa97", "042887", "e435ab", "f8a49f"}
defaultColorList = {"Red", "Blue", "Orange", "Green"}
playerSpot = 0

function onCollisionEnter(info)
  playerSpot = 0
  local mentatColor = ""
  if info.collision_object.getDescription() == "Agent" then
    if info.collision_object.getName() == "Mentat" then
      mentatColor = getObjectFromGUID("e7e9b1").getVar("playerColor")
    end
    if mentatColor == "Red" or info.collision_object.getName() == "Red Agent" or info.collision_object.getName() == "Red Swordmaster" then
      playerSpot = 1
    elseif mentatColor == "Blue" or info.collision_object.getName() == "Blue Agent" or info.collision_object.getName() == "Blue Swordmaster" then
      playerSpot = 2
    elseif mentatColor == "Orange" or info.collision_object.getName() == "Orange Agent" or info.collision_object.getName() == "Orange Swordmaster" then
      playerSpot = 3
    elseif mentatColor == "Green" or info.collision_object.getName() == "Green Agent" or info.collision_object.getName() == "Green Swordmaster" then
      playerSpot = 4
    end

    if playerSpot != 0 and Global.getVar("rivals")[playerSpot] != 1 then
      startLuaCoroutine(self, "boardActionOne")
      startLuaCoroutine(self, "boardActionTwo")
      startLuaCoroutine(self, "boardActionThree")

      broadcastToAll(defaultColorList[playerSpot] .. " Player May Send Troops to the Conflict Space")
    end
  end
end

function boardActionOne()
  for i=1, 5 do
    getObjectFromGUID(playerBoards[playerSpot]).call("addGarrison",{})

    local Time = os.clock() + 0.5
     while os.clock() < Time do
       coroutine.yield(0)
     end
  end
  return 1
end

function boardActionTwo()
  for i=1, 2 do
    getObjectFromGUID(playerBoards[playerSpot]).call("takeWater",{})

    local Time = os.clock() + 0.5
     while os.clock() < Time do
       coroutine.yield(0)
     end
  end
  return 1
end

function boardActionThree()
  for i=1, 6 do
    getObjectFromGUID(playerBoards[playerSpot]).call("spendOneSpice",{})

    local Time = os.clock() + 1.0
     while os.clock() < Time do
       coroutine.yield(0)
     end
  end
  return 1
end

-- ===== CardCustom ce1823 (1472 chars) =====
playerBoards = {"a0fa97", "042887", "e435ab", "f8a49f"}
defaultColorList = {"Red", "Blue", "Orange", "Green"}
playerSpot = 0

function onCollisionEnter(info)
  playerSpot = 0
  local mentatColor = ""
  if info.collision_object.getDescription() == "Agent" then
    if info.collision_object.getName() == "Mentat" then
      mentatColor = getObjectFromGUID("e7e9b1").getVar("playerColor")
    end
    if mentatColor == "Red" or info.collision_object.getName() == "Red Agent" or info.collision_object.getName() == "Red Swordmaster" then
      playerSpot = 1
    elseif mentatColor == "Blue" or info.collision_object.getName() == "Blue Agent" or info.collision_object.getName() == "Blue Swordmaster" then
      playerSpot = 2
    elseif mentatColor == "Orange" or info.collision_object.getName() == "Orange Agent" or info.collision_object.getName() == "Orange Swordmaster" then
      playerSpot = 3
    elseif mentatColor == "Green" or info.collision_object.getName() == "Green Agent" or info.collision_object.getName() == "Green Swordmaster" then
      playerSpot = 4
    end

    if playerSpot != 0 and Global.getVar("rivals")[playerSpot] != 1 then
      startLuaCoroutine(self, "boardAction")
    end
  end
end

function boardAction()
  for i=1, 2 do
    getObjectFromGUID(playerBoards[playerSpot]).call("takeOneSolaris",{})

    local Time = os.clock() + 0.5
     while os.clock() < Time do
       coroutine.yield(0)
     end
  end
  return 1
end

-- ===== CardCustom 3f68f3 (1851 chars) =====
playerBoards = {"a0fa97", "042887", "e435ab", "f8a49f"}
defaultColorList = {"Red", "Blue", "Orange", "Green"}
playerSpot = 0

function onCollisionEnter(info)
  playerSpot = 0
  local mentatColor = ""
  if info.collision_object.getDescription() == "Agent" then
    if info.collision_object.getName() == "Mentat" then
      mentatColor = getObjectFromGUID("e7e9b1").getVar("playerColor")
    end
    if mentatColor == "Red" or info.collision_object.getName() == "Red Agent" or info.collision_object.getName() == "Red Swordmaster" then
      playerSpot = 1
    elseif mentatColor == "Blue" or info.collision_object.getName() == "Blue Agent" or info.collision_object.getName() == "Blue Swordmaster" then
      playerSpot = 2
    elseif mentatColor == "Orange" or info.collision_object.getName() == "Orange Agent" or info.collision_object.getName() == "Orange Swordmaster" then
      playerSpot = 3
    elseif mentatColor == "Green" or info.collision_object.getName() == "Green Agent" or info.collision_object.getName() == "Green Swordmaster" then
      playerSpot = 4
    end
    if playerSpot != 0 and Global.getVar("rivals")[playerSpot] != 1 then
      startLuaCoroutine(self, "boardActionOne")
    end

  end
end

function boardActionOne()
  for i=1, 4 do
    getObjectFromGUID(playerBoards[playerSpot]).call("spendOneSpice",{})

    local Time = os.clock() + 1.0
     while os.clock() < Time do
       coroutine.yield(0)
     end
  end
  for j=1, 2 do
    getObjectFromGUID(playerBoards[playerSpot]).call("addGarrison",{})

    local Time = os.clock() + 0.5
     while os.clock() < Time do
       coroutine.yield(0)
     end
  end
  params = {defaultColorList[playerSpot]}
  getObjectFromGUID("7962b9").call("intrigueBoardDraw",{params})
  getObjectFromGUID("3f6168").call("takeBoardSolaris",{params})
  return 1
end

-- ===== CardCustom de2909 (2283 chars) =====
playerBoards = {"a0fa97", "042887", "e435ab", "f8a49f"}
defaultColorList = {"Red", "Blue", "Orange", "Green"}

spiceBowls = {"8655b7", "9a6fc5", "1d6251", "6fae7e"}

playerSpot = 0

function onCollisionEnter(info)
  playerSpot = 0
  local mentatColor = ""
  if info.collision_object.getDescription() == "Agent" then
    if info.collision_object.getName() == "Mentat" then
      mentatColor = getObjectFromGUID("e7e9b1").getVar("playerColor")
    end
    if mentatColor == "Red" or info.collision_object.getName() == "Red Agent" or info.collision_object.getName() == "Red Swordmaster" then
      playerSpot = 1
    elseif mentatColor == "Blue" or info.collision_object.getName() == "Blue Agent" or info.collision_object.getName() == "Blue Swordmaster" then
      playerSpot = 2
    elseif mentatColor == "Orange" or info.collision_object.getName() == "Orange Agent" or info.collision_object.getName() == "Orange Swordmaster" then
      playerSpot = 3
    elseif mentatColor == "Green" or info.collision_object.getName() == "Green Agent" or info.collision_object.getName() == "Green Swordmaster" then
      playerSpot = 4
    end
    if playerSpot != 0 and Global.getVar("rivals")[playerSpot] != 1 then
      startLuaCoroutine(self, "boardAction")
      broadcastToAll(defaultColorList[playerSpot] .. " Player May Send Troops to the Conflict Space")
      takeBonusSpice()
    end
  end
end

function boardAction()
  for i=1, 2 do
    getObjectFromGUID(playerBoards[playerSpot]).call("spendWater",{})

    local Time = os.clock() + 0.5
     while os.clock() < Time do
       coroutine.yield(0)
     end
  end

  for i=1, 3 do
    getObjectFromGUID(playerBoards[playerSpot]).call("takeOneSpice",{})

    local Time = os.clock() + 0.5
     while os.clock() < Time do
       coroutine.yield(0)
     end
  end
  return 1
end

function takeBonusSpice()
  local spiceArea = getObjectFromGUID("7a4151").getObjects()
  for _, item in ipairs(spiceArea) do
    if item.getName() == "1 Spice" then
      local bowlPos = getObjectFromGUID(spiceBowls[playerSpot]).getPosition()
      bowlPos.x = bowlPos.x + (math.random(1,2)/4)
      bowlPos.y = 3.5
      bowlPos.z = bowlPos.z + (math.random(1,2)/4)
      item.setPositionSmooth(bowlPos,false,true)          
    end
  end
end

-- ===== CardCustom e19689 (2150 chars) =====
playerBoards = {"a0fa97", "042887", "e435ab", "f8a49f"}
defaultColorList = {"Red", "Blue", "Orange", "Green"}

spiceBowls = {"8655b7", "9a6fc5", "1d6251", "6fae7e"}

playerSpot = 0

function onCollisionEnter(info)
  playerSpot = 0
  local mentatColor = ""
  if info.collision_object.getDescription() == "Agent" then
    if info.collision_object.getName() == "Mentat" then
      mentatColor = getObjectFromGUID("e7e9b1").getVar("playerColor")
    end
    if mentatColor == "Red" or info.collision_object.getName() == "Red Agent" or info.collision_object.getName() == "Red Swordmaster" then
      playerSpot = 1
    elseif mentatColor == "Blue" or info.collision_object.getName() == "Blue Agent" or info.collision_object.getName() == "Blue Swordmaster" then
      playerSpot = 2
    elseif mentatColor == "Orange" or info.collision_object.getName() == "Orange Agent" or info.collision_object.getName() == "Orange Swordmaster" then
      playerSpot = 3
    elseif mentatColor == "Green" or info.collision_object.getName() == "Green Agent" or info.collision_object.getName() == "Green Swordmaster" then
      playerSpot = 4
    end
    if playerSpot != 0 and Global.getVar("rivals")[playerSpot] != 1 then
      startLuaCoroutine(self, "boardAction")
      broadcastToAll(defaultColorList[playerSpot] .. " Player May Send Troops to the Conflict Space")
      takeBonusSpice()
    end
  end
end

function boardAction()
  getObjectFromGUID(playerBoards[playerSpot]).call("spendWater",{})

  for i=1, 2 do
    getObjectFromGUID(playerBoards[playerSpot]).call("takeOneSpice",{})

    local Time = os.clock() + 0.5
     while os.clock() < Time do
       coroutine.yield(0)
     end
  end
  return 1
end

function takeBonusSpice()
  local spiceArea = getObjectFromGUID("b379ba").getObjects()
  for _, item in ipairs(spiceArea) do
    if item.getName() == "1 Spice" then
      local bowlPos = getObjectFromGUID(spiceBowls[playerSpot]).getPosition()
      bowlPos.x = bowlPos.x + (math.random(1,2)/4)
      bowlPos.y = 3.5
      bowlPos.z = bowlPos.z + (math.random(1,2)/4)
      item.setPositionSmooth(bowlPos,false,true)          
    end
  end
end

-- ===== CardCustom e15054 (2944 chars) =====
playerBoards = {"a0fa97", "042887", "e435ab", "f8a49f"}
defaultColorList = {"Red", "Blue", "Orange", "Green"}

spiceBowls = {"8655b7", "9a6fc5", "1d6251", "6fae7e"}

playerSpot = 0

controlMarkerZone = "f6c041"

function onCollisionEnter(info)
  playerSpot = 0
  local mentatColor = ""
  if info.collision_object.getDescription() == "Agent" then
    if info.collision_object.getName() == "Mentat" then
      mentatColor = getObjectFromGUID("e7e9b1").getVar("playerColor")
    end
    if mentatColor == "Red" or info.collision_object.getName() == "Red Agent" or info.collision_object.getName() == "Red Swordmaster" then
      playerSpot = 1
    elseif mentatColor == "Blue" or info.collision_object.getName() == "Blue Agent" or info.collision_object.getName() == "Blue Swordmaster" then
      playerSpot = 2
    elseif mentatColor == "Orange" or info.collision_object.getName() == "Orange Agent" or info.collision_object.getName() == "Orange Swordmaster" then
      playerSpot = 3
    elseif mentatColor == "Green" or info.collision_object.getName() == "Green Agent" or info.collision_object.getName() == "Green Swordmaster" then
      playerSpot = 4
    end
    if playerSpot != 0 and Global.getVar("rivals")[playerSpot] != 1 then
      getObjectFromGUID(playerBoards[playerSpot]).call("takeOneSpice",{})
      broadcastToAll(defaultColorList[playerSpot] .. " Player May Send Troops to the Conflict Space")
      takeBonusSpice()
    end

    local controlArea = getObjectFromGUID(controlMarkerZone).getObjects()
    for _, item in ipairs(controlArea) do
      if item.getName() == "Red Control Marker" then
        getObjectFromGUID(playerBoards[1]).call("takeOneSpice",{})
        Wait.frames(function() broadcastToAll("Red Player Receives 1 Spice for Control Marker") end, 45)
      elseif item.getName() == "Blue Control Marker" then
        getObjectFromGUID(playerBoards[2]).call("takeOneSpice",{})
        Wait.frames(function() broadcastToAll("Blue Player Receives 1 Spice for Control Marker") end, 45)
      elseif item.getName() == "Orange Control Marker" then
        getObjectFromGUID(playerBoards[3]).call("takeOneSpice",{})
        Wait.frames(function() broadcastToAll("Orange Player Receives 1 Spice for Control Marker") end, 45)
      elseif item.getName() == "Green Control Marker" then
        getObjectFromGUID(playerBoards[4]).call("takeOneSpice",{})
        Wait.frames(function() broadcastToAll("Green Player Receives 1 Spice for Control Marker") end, 45)
      end
    end

  end
end

function takeBonusSpice()
  local spiceArea = getObjectFromGUID("1cc416").getObjects()
  for _, item in ipairs(spiceArea) do
    if item.getName() == "1 Spice" then
      local bowlPos = getObjectFromGUID(spiceBowls[playerSpot]).getPosition()
      bowlPos.x = bowlPos.x + (math.random(1,2)/4)
      bowlPos.y = 3.5
      bowlPos.z = bowlPos.z + (math.random(1,2)/4)
      item.setPositionSmooth(bowlPos,false,true)
    end
  end
end

-- ===== CardCustom 75903b (1400 chars) =====
playerBoards = {"a0fa97", "042887", "e435ab", "f8a49f"}
defaultColorList = {"Red", "Blue", "Orange", "Green"}

function onCollisionEnter(info)
  local playerSpot = 0
  local mentatColor = ""
  if info.collision_object.getDescription() == "Agent" then
    if info.collision_object.getName() == "Mentat" then
      mentatColor = getObjectFromGUID("e7e9b1").getVar("playerColor")
    end
    if mentatColor == "Red" or info.collision_object.getName() == "Red Agent" or info.collision_object.getName() == "Red Swordmaster" then
      playerSpot = 1
    elseif mentatColor == "Blue" or info.collision_object.getName() == "Blue Agent" or info.collision_object.getName() == "Blue Swordmaster" then
      playerSpot = 2
    elseif mentatColor == "Orange" or info.collision_object.getName() == "Orange Agent" or info.collision_object.getName() == "Orange Swordmaster" then
      playerSpot = 3
    elseif mentatColor == "Green" or info.collision_object.getName() == "Green Agent" or info.collision_object.getName() == "Green Swordmaster" then
      playerSpot = 4
    end
    if playerSpot != 0 and Global.getVar("rivals")[playerSpot] != 1 then
      getObjectFromGUID(playerBoards[playerSpot]).call("takeWater",{})
      getObjectFromGUID(playerBoards[playerSpot]).call("addGarrison",{})
      broadcastToAll(defaultColorList[playerSpot] .. " Player May Send Troops to the Conflict Space")
    end
  end
end

-- ===== CardCustom d43969 (1753 chars) =====
playerBoards = {"a0fa97", "042887", "e435ab", "f8a49f"}
defaultColorList = {"Red", "Blue", "Orange", "Green"}

playerSpot = 0

function onCollisionEnter(info)
  playerSpot = 0
  local mentatColor = ""
  if info.collision_object.getDescription() == "Agent" then
    if info.collision_object.getName() == "Mentat" then
      mentatColor = getObjectFromGUID("e7e9b1").getVar("playerColor")
    end
    if mentatColor == "Red" or info.collision_object.getName() == "Red Agent" or info.collision_object.getName() == "Red Swordmaster" then
      playerSpot = 1
    elseif mentatColor == "Blue" or info.collision_object.getName() == "Blue Agent" or info.collision_object.getName() == "Blue Swordmaster" then
      playerSpot = 2
    elseif mentatColor == "Orange" or info.collision_object.getName() == "Orange Agent" or info.collision_object.getName() == "Orange Swordmaster" then
      playerSpot = 3
    elseif mentatColor == "Green" or info.collision_object.getName() == "Green Agent" or info.collision_object.getName() == "Green Swordmaster" then
      playerSpot = 4
    end
    if playerSpot != 0 and Global.getVar("rivals")[playerSpot] != 1 then
      startLuaCoroutine(self, "boardAction")
      broadcastToAll(defaultColorList[playerSpot] .. " Player May Send Troops to the Conflict Space")
    end
  end
end

function boardAction()
  for i=1, 2 do
    getObjectFromGUID(playerBoards[playerSpot]).call("spendWater",{})

    local Time = os.clock() + 0.5
     while os.clock() < Time do
       coroutine.yield(0)
     end
  end
  for i=1, 3 do
    getObjectFromGUID(playerBoards[playerSpot]).call("drawCard",{})

    local Time = os.clock() + 0.5
     while os.clock() < Time do
       coroutine.yield(0)
     end
  end
  return 1
end

-- ===== CardCustom bf02c1 (2575 chars) =====
playerBoards = {"a0fa97", "042887", "e435ab", "f8a49f"}
defaultColorList = {"Red", "Blue", "Orange", "Green"}
playerSpot = 0

controlMarkerZone = "d5f23c"

function onCollisionEnter(info)
  playerSpot = 0
  local mentatColor = ""
  if info.collision_object.getDescription() == "Agent" then
    if info.collision_object.getName() == "Mentat" then
      mentatColor = getObjectFromGUID("e7e9b1").getVar("playerColor")
    end
    if mentatColor == "Red" or info.collision_object.getName() == "Red Agent" or info.collision_object.getName() == "Red Swordmaster" then
      playerSpot = 1
    elseif mentatColor == "Blue" or info.collision_object.getName() == "Blue Agent" or info.collision_object.getName() == "Blue Swordmaster" then
      playerSpot = 2
    elseif mentatColor == "Orange" or info.collision_object.getName() == "Orange Agent" or info.collision_object.getName() == "Orange Swordmaster" then
      playerSpot = 3
    elseif mentatColor == "Green" or info.collision_object.getName() == "Green Agent" or info.collision_object.getName() == "Green Swordmaster" then
      playerSpot = 4
    end

    if playerSpot != 0 and Global.getVar("rivals")[playerSpot] != 1 then
      getObjectFromGUID(playerBoards[playerSpot]).call("addGarrison",{})

      params = {defaultColorList[playerSpot]}
      getObjectFromGUID("7962b9").call("intrigueBoardDraw",{params})
      broadcastToAll(defaultColorList[playerSpot] .. " Player May Send Troops to the Conflict Space")
    end

    local controlArea = getObjectFromGUID(controlMarkerZone).getObjects()
    for _, item in ipairs(controlArea) do
      if item.getName() == "Red Control Marker" then
        getObjectFromGUID(playerBoards[1]).call("takeOneSolaris",{})
        Wait.frames(function() broadcastToAll("Red Player Receives 1 Solaris for Control Marker") end, 45)
      elseif item.getName() == "Blue Control Marker" then
        getObjectFromGUID(playerBoards[2]).call("takeOneSolaris",{})
        Wait.frames(function() broadcastToAll("Blue Player Receives 1 Solaris for Control Marker") end, 45)
      elseif item.getName() == "Orange Control Marker" then
        getObjectFromGUID(playerBoards[3]).call("takeOneSolaris",{})
        Wait.frames(function() broadcastToAll("Orange Player Receives 1 Solaris for Control Marker") end, 45)
      elseif item.getName() == "Green Control Marker" then
        getObjectFromGUID(playerBoards[4]).call("takeOneSolaris",{})
        Wait.frames(function() broadcastToAll("Green Player Receives 1 Solaris for Control Marker") end, 45)
      end
    end

  end
end

-- ===== CardCustom c684d5 (2505 chars) =====
playerBoards = {"a0fa97", "042887", "e435ab", "f8a49f"}
defaultColorList = {"Red", "Blue", "Orange", "Green"}

controlMarkerZone = "e9ec56"

function onCollisionEnter(info)
  local playerSpot = 0
  local mentatColor = ""
  if info.collision_object.getDescription() == "Agent" then
    if info.collision_object.getName() == "Mentat" then
      mentatColor = getObjectFromGUID("e7e9b1").getVar("playerColor")
    end
    if mentatColor == "Red" or info.collision_object.getName() == "Red Agent" or info.collision_object.getName() == "Red Swordmaster" then
      playerSpot = 1
    elseif mentatColor == "Blue" or info.collision_object.getName() == "Blue Agent" or info.collision_object.getName() == "Blue Swordmaster" then
      playerSpot = 2
    elseif mentatColor == "Orange" or info.collision_object.getName() == "Orange Agent" or info.collision_object.getName() == "Orange Swordmaster" then
      playerSpot = 3
    elseif mentatColor == "Green" or info.collision_object.getName() == "Green Agent" or info.collision_object.getName() == "Green Swordmaster" then
      playerSpot = 4
    end
    if playerSpot != 0 and Global.getVar("rivals")[playerSpot] != 1 then
      getObjectFromGUID(playerBoards[playerSpot]).call("drawCard",{})
      getObjectFromGUID(playerBoards[playerSpot]).call("addGarrison",{})
      broadcastToAll(defaultColorList[playerSpot] .. " Player May Send Troops to the Conflict Space")
    end

    local controlArea = getObjectFromGUID(controlMarkerZone).getObjects()
    for _, item in ipairs(controlArea) do
      if item.getName() == "Red Control Marker" then
        getObjectFromGUID(playerBoards[1]).call("takeOneSolaris",{})
        Wait.frames(function() broadcastToAll("Red Player Receives 1 Solaris for Control Marker") end, 45)
      elseif item.getName() == "Blue Control Marker" then
        getObjectFromGUID(playerBoards[2]).call("takeOneSolaris",{})
        Wait.frames(function() broadcastToAll("Blue Player Receives 1 Solaris for Control Marker") end, 45)
      elseif item.getName() == "Orange Control Marker" then
        getObjectFromGUID(playerBoards[3]).call("takeOneSolaris",{})
        Wait.frames(function() broadcastToAll("Orange Player Receives 1 Solaris for Control Marker") end, 45)
      elseif item.getName() == "Green Control Marker" then
        getObjectFromGUID(playerBoards[4]).call("takeOneSolaris",{})
        Wait.frames(function() broadcastToAll("Green Player Receives 1 Solaris for Control Marker") end, 45)
      end
    end

  end
end

-- ===== CardCustom db461b (1456 chars) =====
playerBoards = {"a0fa97", "042887", "e435ab", "f8a49f"}
defaultColorList = {"Red", "Blue", "Orange", "Green"}

playerSpot = 0

function onCollisionEnter(info)
  playerSpot = 0
  local mentatColor = ""
  if info.collision_object.getDescription() == "Agent" then
    if info.collision_object.getName() == "Mentat" then
      mentatColor = getObjectFromGUID("e7e9b1").getVar("playerColor")
    end
    if mentatColor == "Red" or info.collision_object.getName() == "Red Agent" or info.collision_object.getName() == "Red Swordmaster" then
      playerSpot = 1
    elseif mentatColor == "Blue" or info.collision_object.getName() == "Blue Agent" or info.collision_object.getName() == "Blue Swordmaster" then
      playerSpot = 2
    elseif mentatColor == "Orange" or info.collision_object.getName() == "Orange Agent" or info.collision_object.getName() == "Orange Swordmaster" then
      playerSpot = 3
    elseif mentatColor == "Green" or info.collision_object.getName() == "Green Agent" or info.collision_object.getName() == "Green Swordmaster" then
      playerSpot = 4
    end
    if playerSpot != 0 and Global.getVar("rivals")[playerSpot] != 1 then
       startLuaCoroutine(self, "boardAction")
    end
  end
end

function boardAction()
  for i=1, 3 do
    getObjectFromGUID(playerBoards[playerSpot]).call("takeOneSolaris",{})

    local Time = os.clock() + 0.5
     while os.clock() < Time do
       coroutine.yield(0)
     end
  end
  return 1
end

-- ===== CardCustom a15d7a (1258 chars) =====
playerBoards = {"a0fa97", "042887", "e435ab", "f8a49f"}
defaultColorList = {"Red", "Blue", "Orange", "Green"}

playerSpot = 0

function onCollisionEnter(info)
  playerSpot = 0
  local mentatColor = ""
  if info.collision_object.getDescription() == "Agent" then
    if info.collision_object.getName() == "Mentat" then
      mentatColor = getObjectFromGUID("e7e9b1").getVar("playerColor")
    end
    if mentatColor == "Red" or info.collision_object.getName() == "Red Agent" or info.collision_object.getName() == "Red Swordmaster" then
      playerSpot = 1
    elseif mentatColor == "Blue" or info.collision_object.getName() == "Blue Agent" or info.collision_object.getName() == "Blue Swordmaster" then
      playerSpot = 2
    elseif mentatColor == "Orange" or info.collision_object.getName() == "Orange Agent" or info.collision_object.getName() == "Orange Swordmaster" then
      playerSpot = 3
    elseif mentatColor == "Green" or info.collision_object.getName() == "Green Agent" or info.collision_object.getName() == "Green Swordmaster" then
      playerSpot = 4
    end
    if playerSpot != 0 and Global.getVar("rivals")[playerSpot] != 1 then
      broadcastToAll(defaultColorList[playerSpot] .. " Player may exchange Spice for Solaris")
    end
  end
end

-- ===== CardCustom 01a7ba (1226 chars) =====
playerBoards = {"a0fa97", "042887", "e435ab", "f8a49f"}
defaultColorList = {"Red", "Blue", "Orange", "Green"}

function onCollisionEnter(info)
  local playerSpot = 0
  local mentatColor = ""
  if info.collision_object.getDescription() == "Agent" then
    if info.collision_object.getName() == "Mentat" then
      mentatColor = getObjectFromGUID("e7e9b1").getVar("playerColor")
    end
    if mentatColor == "Red" or info.collision_object.getName() == "Red Agent" or info.collision_object.getName() == "Red Swordmaster" then
      playerSpot = 1
    elseif mentatColor == "Blue" or info.collision_object.getName() == "Blue Agent" or info.collision_object.getName() == "Blue Swordmaster" then
      playerSpot = 2
    elseif mentatColor == "Orange" or info.collision_object.getName() == "Orange Agent" or info.collision_object.getName() == "Orange Swordmaster" then
      playerSpot = 3
    elseif mentatColor == "Green" or info.collision_object.getName() == "Green Agent" or info.collision_object.getName() == "Green Swordmaster" then
      playerSpot = 4
    end
    if playerSpot != 0 and Global.getVar("rivals")[playerSpot] != 1 then
      getObjectFromGUID(playerBoards[playerSpot]).call("addGarrison",{})
    end
  end
end

-- ===== CardCustom 3893f1 (1559 chars) =====
playerBoards = {"a0fa97", "042887", "e435ab", "f8a49f"}
defaultColorList = {"Red", "Blue", "Orange", "Green"}
mentatPos = {{-45.38, 2, -19.66},{-19.99, 2, -19.80},{9.93, 2, -19.82},{34.72, 2, -19.91}}

playerSpot = 0

function onCollisionEnter(info)
  playerSpot = 0

  local swordTokens = Global.getVar("swordMasterTokens")
  local swordBoardPos = getObjectFromGUID("2da390").getVar("councilorSpots")
  local mentatColor = ""

  if info.collision_object.getDescription() == "Agent" then
    if info.collision_object.getName() == "Mentat" then
      mentatColor = getObjectFromGUID("e7e9b1").getVar("playerColor")
    end
    if mentatColor == "Red" or info.collision_object.getName() == "Red Agent" then
      playerSpot = 1
    elseif mentatColor == "Blue" or info.collision_object.getName() == "Blue Agent" then
      playerSpot = 2
    elseif mentatColor == "Orange" or info.collision_object.getName() == "Orange Agent" then
      playerSpot = 3
    elseif mentatColor == "Green" or info.collision_object.getName() == "Green Agent" then
      playerSpot = 4
    end
    if playerSpot != 0 and Global.getVar("rivals")[playerSpot] != 1 then
      startLuaCoroutine(self, "boardAction")
      getObjectFromGUID(swordTokens[playerSpot]).setPositionSmooth(swordBoardPos[playerSpot],fasle,true)
    end
  end
end

function boardAction()
  for i=1, 8 do
    getObjectFromGUID(playerBoards[playerSpot]).call("spendOneSolaris",{})

    local Time = os.clock() + 1.00
     while os.clock() < Time do
       coroutine.yield(0)
     end
  end
  return 1
end

-- ===== CardCustom c6d60f (1662 chars) =====
playerBoards = {"a0fa97", "042887", "e435ab", "f8a49f"}
defaultColorList = {"Red", "Blue", "Orange", "Green"}

playerSpot = 0

function onCollisionEnter(info)
  playerSpot = 0
  local mentatColor = ""
  if info.collision_object.getDescription() == "Agent" then
    if info.collision_object.getName() == "Mentat" then
      mentatColor = getObjectFromGUID("e7e9b1").getVar("playerColor")
    end
    if mentatColor == "Red" or info.collision_object.getName() == "Red Agent" or info.collision_object.getName() == "Red Swordmaster" then
      playerSpot = 1
    elseif mentatColor == "Blue" or info.collision_object.getName() == "Blue Agent" or info.collision_object.getName() == "Blue Swordmaster" then
      playerSpot = 2
    elseif mentatColor == "Orange" or info.collision_object.getName() == "Orange Agent" or info.collision_object.getName() == "Orange Swordmaster" then
      playerSpot = 3
    elseif mentatColor == "Green" or info.collision_object.getName() == "Green Agent" or info.collision_object.getName() == "Green Swordmaster" then
      playerSpot = 4
    end
    if playerSpot != 0 and Global.getVar("rivals")[playerSpot] != 1 then
       startLuaCoroutine(self, "boardAction")
    end
  end
end

function boardAction()
  for i=1, 4 do
    getObjectFromGUID(playerBoards[playerSpot]).call("spendOneSolaris",{})

    local Time = os.clock() + 1.0
     while os.clock() < Time do
       coroutine.yield(0)
     end
  end

  for i=1, 4 do
    getObjectFromGUID(playerBoards[playerSpot]).call("addGarrison",{})

    local Time = os.clock() + 0.75
     while os.clock() < Time do
       coroutine.yield(0)
     end
  end
  return 1
end

-- ===== CardCustom 42028f (1869 chars) =====
playerBoards = {"a0fa97", "042887", "e435ab", "f8a49f"}
defaultColorList = {"Red", "Blue", "Orange", "Green"}
mentatPos = {{-45.38, 2, -19.66},{-19.99, 2, -19.80},{9.93, 2, -19.82},{34.72, 2, -19.91}}

playerSpot = 0

function onCollisionEnter(info)
  playerSpot = 0

  if info.collision_object.getDescription() == "Agent" then
    if info.collision_object.getName() != "Mentat" then
     if info.collision_object.getName() == "Red Agent" or info.collision_object.getName() == "Red Swordmaster" then
      playerSpot = 1
     elseif info.collision_object.getName() == "Blue Agent" or info.collision_object.getName() == "Blue Swordmaster" then
      playerSpot = 2
     elseif info.collision_object.getName() == "Orange Agent" or info.collision_object.getName() == "Orange Swordmaster" then
      playerSpot = 3
     elseif info.collision_object.getName() == "Green Agent" or info.collision_object.getName() == "Green Swordmaster" then
      playerSpot = 4
     end
    end
    if playerSpot != 0 and Global.getVar("rivals")[playerSpot] != 1 then
      startLuaCoroutine(self, "boardAction")
      getObjectFromGUID(playerBoards[playerSpot]).call("drawCard",{})
      getObjectFromGUID("e7e9b1").setPositionSmooth(mentatPos[playerSpot],false,true)
    end
  end
end

function boardAction()
  if getObjectFromGUID("2da390").getVar("difficultyLevel") == 1 then
   for i=1, 2 do
    getObjectFromGUID(playerBoards[playerSpot]).call("spendOneSolaris",{})

    local Time = os.clock() + 1.0
     while os.clock() < Time do
       coroutine.yield(0)
     end
   end
 elseif getObjectFromGUID("2da390").getVar("difficultyLevel") > 1 then
   for i=1, 5 do
    getObjectFromGUID(playerBoards[playerSpot]).call("spendOneSolaris",{})

    local Time = os.clock() + 1.0
     while os.clock() < Time do
       coroutine.yield(0)
     end
   end
 end
  return 1
end

-- ===== CardCustom 5b7793 (1435 chars) =====
playerBoards = {"a0fa97", "042887", "e435ab", "f8a49f"}
defaultColorList = {"Red", "Blue", "Orange", "Green"}

playerSpot = 0

function onCollisionEnter(info)
  if info.collision_object.getDescription() == "Agent" then
    if info.collision_object.getName() == "Mentat" then
      mentatColor = getObjectFromGUID("e7e9b1").getVar("playerColor")
    end

    playerSpot = 0

    if mentatColor == "Red" or info.collision_object.getName() == "Red Agent" or info.collision_object.getName() == "Red Swordmaster" then
      playerSpot = 1
    elseif mentatColor == "Blue" or info.collision_object.getName() == "Blue Agent" or info.collision_object.getName() == "Blue Swordmaster" then
      playerSpot = 2
    elseif mentatColor == "Orange" or info.collision_object.getName() == "Orange Agent" or info.collision_object.getName() == "Orange Swordmaster" then
      playerSpot = 3
    elseif mentatColor == "Green" or info.collision_object.getName() == "Green Agent" or info.collision_object.getName() == "Green Swordmaster" then
      playerSpot = 4
    end
    if playerSpot != 0 and Global.getVar("rivals")[playerSpot] != 1 then
      startLuaCoroutine(self, "boardAction")
    end
  end
end

function boardAction()
  for i=1, 5 do
    getObjectFromGUID(playerBoards[playerSpot]).call("spendOneSolaris",{})

    local Time = os.clock() + 1.0
     while os.clock() < Time do
       coroutine.yield(0)
     end
  end
  return 1
end

-- ===== CardCustom 4f0435 (2600 chars) =====
colorRef = {["Red"] = 1, ["Blue"] = 2, ["Orange"] = 3, ["Green"] = 4}
playerBoards = {"a0fa97", "042887", "e435ab", "f8a49f"}

resourceTracker = {0,0,0,0}
resourceRange = {-5.05, -3.62}
bottomRange = {-8.62, -5.92}

rivalColor = ""
playerPingCount = 0
playerCheck = ""

function onSave()
  local rt = resourceTracker
  local data_to_save = {rt}

  saved_data_res = JSON.encode(data_to_save)
  return saved_data_res
end

function onLoad(saved_data_res)
 if saved_data_res ~= "" and saved_data_res ~= nil then
    local loaded_data = JSON.decode(saved_data_res)

    resourceTracker = loaded_data[1]

    if resourceTracker == nil then
      resourceTracker = {0,0,0,0}
    end
 else
   resourceTracker = {0,0,0,0}
   rivalColor = ""
   playerPingCount = 0
   playerCheck = 0
 end
end

function onCollisionEnter(info)
  checkPlayerRival()
  
  if info.collision_object.tag == "Block" then
    local blockPos = info.collision_object.getPosition()

    if resourceTracker[colorRef[info.collision_object.getName()]] == 0 and round(blockPos.z,2) >= resourceRange[1] and round(blockPos.z,2) <= resourceRange[2] then
      if playerPingCount != 2 then
        getObjectFromGUID(playerBoards[colorRef[info.collision_object.getName()]]).call("takeWater",{})
      elseif playerPingCount == 2 then
        if info.collision_object.getName() != rivalColor then
          getObjectFromGUID(playerBoards[colorRef[info.collision_object.getName()]]).call("takeWater",{})
        end
      end
      resourceTracker[colorRef[info.collision_object.getName()]] = 1
    elseif resourceTracker[colorRef[info.collision_object.getName()]] == 1 and round(blockPos.z,2) >= bottomRange[1] and round(blockPos.z,2) <= bottomRange[2] then
      resourceTracker[colorRef[info.collision_object.getName()]] = 0
    end

  end
end

function round(num, dec)
  local mult = 10^(dec or 0)
  return math.floor(num * mult + 0.5) / mult
end

function checkPlayerRival()
  rivalColor = ""
  playerPingCount = 0
  playerCheck = Player.getPlayers()

  for _, playerPing in ipairs(playerCheck) do
    if playerPing.color == "Red" or playerPing.color == "Blue" or playerPing.color == "Orange" or playerPing.color == "Green" then
      playerPingCount = playerPingCount + 1
    end
  end

  if playerPingCount == 2 then  
    if Global.getVar("rivals")[1] == 1 then
      rivalColor = "Red"
    elseif Global.getVar("rivals")[2] == 1 then
      rivalColor = "Blue"
    elseif Global.getVar("rivals")[3] == 1 then
      rivalColor = "Orange"
    elseif Global.getVar("rivals")[4] == 1 then
      rivalColor = "Green"
    end
  end
end

-- ===== CardCustom 5bd579 (3249 chars) =====
colorRef = {["Red"] = 1, ["Blue"] = 2, ["Orange"] = 3, ["Green"] = 4}
playerBoards = {"a0fa97", "042887", "e435ab", "f8a49f"}

resourceTracker = {0,0,0,0}
resourceRange = {1.03, 2.53}
bottomRange = {-2.54, 0.16}

rivalColor = ""
rivalCheck = {0,0,0,0}
playerPingCount = 0
playerCheck = ""

function onSave()
  local rt = resourceTracker
  local data_to_save = {rt}

  saved_data_res = JSON.encode(data_to_save)
  return saved_data_res
end

function onLoad(saved_data_res)
 if saved_data_res ~= "" and saved_data_res ~= nil then
    local loaded_data = JSON.decode(saved_data_res)

    resourceTracker = loaded_data[1]

    if resourceTracker == nil then
      resourceTracker = {0,0,0,0}
    end
 else
   resourceTracker = {0,0,0,0}
   rivalColor = ""
   rivalCheck = {0,0,0,0}
   playerPingCount = 0
   playerCheck = 0
 end
end

function onCollisionEnter(info)
  checkPlayerRival()
  for i=1,4 do
    if Global.getVar("rivals")[i] == 1 then
      rivalCheck[i] = 1 
    end
  end


  if info.collision_object.tag == "Block" then
    local blockPos = info.collision_object.getPosition()

    if resourceTracker[colorRef[info.collision_object.getName()]] == 0 and round(blockPos.z,2) >= resourceRange[1] and round(blockPos.z,2) <= resourceRange[2] then
     if playerPingCount == 1 and rivalCheck[colorRef[info.collision_object.getName()]] == 1 then
      getObjectFromGUID(playerBoards[colorRef[info.collision_object.getName()]]).call("drawIntrigue",{})
     elseif playerPingCount == 1 and rivalCheck[colorRef[info.collision_object.getName()]] != 1 then
      params = {info.collision_object.getName()}
      getObjectFromGUID("7962b9").call("intrigueBoardDraw",{params})
     elseif playerPingCount == 2 and info.collision_object.getName() == rivalColor then
      --Do Nothing
      --getObjectFromGUID(playerBoards[colorRef[info.collision_object.getName()]]).call("drawIntrigue",{})
     elseif playerPingCount > 1 and info.collision_object.getName() != rivalColor then
      params = {info.collision_object.getName()}
      getObjectFromGUID("7962b9").call("intrigueBoardDraw",{params})
     end

      resourceTracker[colorRef[info.collision_object.getName()]] = 1
    elseif resourceTracker[colorRef[info.collision_object.getName()]] == 1 and round(blockPos.z,2) >= bottomRange[1] and round(blockPos.z,2) <= bottomRange[2] then
      resourceTracker[colorRef[info.collision_object.getName()]] = 0
    end

  end
end

function round(num, dec)
  local mult = 10^(dec or 0)
  return math.floor(num * mult + 0.5) / mult
end

function checkPlayerRival()
  rivalColor = ""
  playerPingCount = 0
  playerCheck = Player.getPlayers()

  for _, playerPing in ipairs(playerCheck) do
    if playerPing.color == "Red" or playerPing.color == "Blue" or playerPing.color == "Orange" or playerPing.color == "Green" then
      playerPingCount = playerPingCount + 1
    end
  end

  if playerPingCount == 2 then  
    if Global.getVar("rivals")[1] == 1 then
      rivalColor = "Red"
    elseif Global.getVar("rivals")[2] == 1 then
      rivalColor = "Blue"
    elseif Global.getVar("rivals")[3] == 1 then
      rivalColor = "Orange"
    elseif Global.getVar("rivals")[4] == 1 then
      rivalColor = "Green"
    end
  end
end

-- ===== CardCustom bfae7c (2809 chars) =====
colorRef = {["Red"] = 1, ["Blue"] = 2, ["Orange"] = 3, ["Green"] = 4}
playerBoards = {"a0fa97", "042887", "e435ab", "f8a49f"}

resourceTracker = {0,0,0,0}
resourceRange = {7.18, 8.64}
bottomRange = {3.61, 6.31}

pColor = ""

rivalColor = ""
playerPingCount = 0
playerCheck = ""

function onSave()
  local rt = resourceTracker
  local data_to_save = {rt}

  saved_data_res = JSON.encode(data_to_save)
  return saved_data_res
end

function onLoad(saved_data_res)
 if saved_data_res ~= "" and saved_data_res ~= nil then
    local loaded_data = JSON.decode(saved_data_res)

    resourceTracker = loaded_data[1]

    if resourceTracker == nil then
      resourceTracker = {0,0,0,0}
    end
 else
   resourceTracker = {0,0,0,0}
   rivalColor = ""
   playerPingCount = 0
   playerCheck = 0
 end
end

function onCollisionEnter(info)
  checkPlayerRival()

  if info.collision_object.tag == "Block" then
    local blockPos = info.collision_object.getPosition()
    pColor = info.collision_object.getName()

    if resourceTracker[colorRef[info.collision_object.getName()]] == 0 and round(blockPos.z,2) >= resourceRange[1] and round(blockPos.z,2) <= resourceRange[2] then
      if playerPingCount != 2 then
        startLuaCoroutine(self, "boardAction")
      elseif playerPingCount == 2 then
        if info.collision_object.getName() != rivalColor then
          startLuaCoroutine(self, "boardAction")
        end
      end
      resourceTracker[colorRef[info.collision_object.getName()]] = 1
    elseif resourceTracker[colorRef[info.collision_object.getName()]] == 1 and round(blockPos.z,2) >= bottomRange[1] and round(blockPos.z,2) <= bottomRange[2] then
      resourceTracker[colorRef[info.collision_object.getName()]] = 0
    end

  end
end

function round(num, dec)
  local mult = 10^(dec or 0)
  return math.floor(num * mult + 0.5) / mult
end

function boardAction()
  for i=1, 3 do
    getObjectFromGUID(playerBoards[colorRef[pColor]]).call("takeOneSolaris",{})

    local Time = os.clock() + 0.5
     while os.clock() < Time do
       coroutine.yield(0)
     end
  end
  return 1
end

function checkPlayerRival()
  rivalColor = ""
  playerPingCount = 0
  playerCheck = Player.getPlayers()

  for _, playerPing in ipairs(playerCheck) do
    if playerPing.color == "Red" or playerPing.color == "Blue" or playerPing.color == "Orange" or playerPing.color == "Green" then
      playerPingCount = playerPingCount + 1
    end
  end

  if playerPingCount == 2 then  
    if Global.getVar("rivals")[1] == 1 then
      rivalColor = "Red"
    elseif Global.getVar("rivals")[2] == 1 then
      rivalColor = "Blue"
    elseif Global.getVar("rivals")[3] == 1 then
      rivalColor = "Orange"
    elseif Global.getVar("rivals")[4] == 1 then
      rivalColor = "Green"
    end
  end
end

-- ===== CardCustom 2d8a49 (1812 chars) =====
colorRef = {["Red"] = 1, ["Blue"] = 2, ["Orange"] = 3, ["Green"] = 4}
playerBoards = {"a0fa97", "042887", "e435ab", "f8a49f"}

resourceTracker = {0,0,0,0}
resourceRange = {13.35, 14.80}
bottomRange = {9.78, 12.48}

pColor = ""

function onSave()
  local rt = resourceTracker
  local data_to_save = {rt}

  saved_data_res = JSON.encode(data_to_save)
  return saved_data_res
end

function onLoad(saved_data_res)
 if saved_data_res ~= "" and saved_data_res ~= nil then
    local loaded_data = JSON.decode(saved_data_res)

    resourceTracker = loaded_data[1]

    if resourceTracker == nil then
      resourceTracker = {0,0,0,0}
    end
 else
   resourceTracker = {0,0,0,0}
   rivalColor = ""
   playerPingCount = 0
   playerCheck = 0
 end
end

function onCollisionEnter(info)
  if info.collision_object.tag == "Block" then
    local blockPos = info.collision_object.getPosition()
    pColor = info.collision_object.getName()

    if resourceTracker[colorRef[info.collision_object.getName()]] == 0 and round(blockPos.z,2) >= resourceRange[1] and round(blockPos.z,2) <= resourceRange[2] then
      startLuaCoroutine(self, "boardAction")
      resourceTracker[colorRef[info.collision_object.getName()]] = 1
    elseif resourceTracker[colorRef[info.collision_object.getName()]] == 1 and round(blockPos.z,2) >= bottomRange[1] and round(blockPos.z,2) <= bottomRange[2] then
      resourceTracker[colorRef[info.collision_object.getName()]] = 0
    end

  end
end

function round(num, dec)
  local mult = 10^(dec or 0)
  return math.floor(num * mult + 0.5) / mult
end

function boardAction()
  for i=1, 2 do
    getObjectFromGUID(playerBoards[colorRef[pColor]]).call("addGarrison",{})

    local Time = os.clock() + 0.5
     while os.clock() < Time do
       coroutine.yield(0)
     end
  end
  return 1
end

-- ===== Tech Tiles dee0f6 (1611 chars) =====
techDisplay = 1

function onLoad()
  buttonRed = 49
  buttonGreen = 115
  buttonBlue = 43

  buttonRed = buttonRed/255
  buttonGreen = buttonGreen/255
  buttonBlue = buttonBlue/255

  self.clearButtons()
  if getObjectFromGUID("784534").getVar("inProgress") == 0 then
    self.createButton ({
      ['click_function'] = 'setDisplay',
      ['label'] = '[x] Show Tech Tiles at Setup',
      ['function_owner'] = self,
      ['position'] = {0.00, 0.7, 1.95},
      ['rotation'] =  {0, 0, 0},
      ['scale'] = {0.7, 0.7, 0.7},
      ['width'] = 3750,
      ['height'] = 500,
      ['font_size'] = 275,
      ['color'] = {buttonRed, buttonGreen, buttonBlue},
      ['font_color'] = "White"
    })
  end
end

function setDisplay()
  if techDisplay == 0 then
    techDisplay = 1
    buttons = self.getButtons()
    local labelCheck = '[ ] Show Tech Tiles at Setup'
    if buttons != nil then
      for i, v in pairs(buttons) do
        if v.label == labelCheck then
          buttonIndex = i-1
        end
      end
    end
    local labelUpdate = '[x] Show Tech Tiles at Setup'
    self.editButton({index=buttonIndex, label=labelUpdate})
  elseif techDisplay == 1 then
    techDisplay = 0
    buttons = self.getButtons()
    local labelCheck = '[x] Show Tech Tiles at Setup'
    if buttons != nil then
      for i, v in pairs(buttons) do
        if v.label == labelCheck then
          buttonIndex = i-1
        end
      end
    end
    local labelUpdate = '[ ] Show Tech Tiles at Setup'
    self.editButton({index=buttonIndex, label=labelUpdate})
  end
end

-- ===== Invasion Ships d92994 (124 chars) =====
function onUpdate()
  if self.is_face_down == true then
    self.tooltip = false
  else self.tooltip = true
  end
end


-- ===== Windtraps 3eb7b6 (124 chars) =====
function onUpdate()
  if self.is_face_down == true then
    self.tooltip = false
  else self.tooltip = true
  end
end


-- ===== Detonation Devices c81426 (124 chars) =====
function onUpdate()
  if self.is_face_down == true then
    self.tooltip = false
  else self.tooltip = true
  end
end


-- ===== Restricted Ordance 70339e (124 chars) =====
function onUpdate()
  if self.is_face_down == true then
    self.tooltip = false
  else self.tooltip = true
  end
end


-- ===== Training Drones e13a99 (124 chars) =====
function onUpdate()
  if self.is_face_down == true then
    self.tooltip = false
  else self.tooltip = true
  end
end


-- ===== Minimic Film fd26f9 (124 chars) =====
function onUpdate()
  if self.is_face_down == true then
    self.tooltip = false
  else self.tooltip = true
  end
end


-- ===== Holtzman Engine 84ab7f (124 chars) =====
function onUpdate()
  if self.is_face_down == true then
    self.tooltip = false
  else self.tooltip = true
  end
end


-- ===== Spaceport 3938e5 (124 chars) =====
function onUpdate()
  if self.is_face_down == true then
    self.tooltip = false
  else self.tooltip = true
  end
end


-- ===== Memocorders 613e52 (124 chars) =====
function onUpdate()
  if self.is_face_down == true then
    self.tooltip = false
  else self.tooltip = true
  end
end


-- ===== Spy Satellites 630428 (124 chars) =====
function onUpdate()
  if self.is_face_down == true then
    self.tooltip = false
  else self.tooltip = true
  end
end


-- ===== Sonic Snoopers cf4203 (124 chars) =====
function onUpdate()
  if self.is_face_down == true then
    self.tooltip = false
  else self.tooltip = true
  end
end


-- ===== Flagship 065d51 (124 chars) =====
function onUpdate()
  if self.is_face_down == true then
    self.tooltip = false
  else self.tooltip = true
  end
end


-- ===== Chaumurky cc9e13 (124 chars) =====
function onUpdate()
  if self.is_face_down == true then
    self.tooltip = false
  else self.tooltip = true
  end
end


-- ===== Disposal Facility 408909 (124 chars) =====
function onUpdate()
  if self.is_face_down == true then
    self.tooltip = false
  else self.tooltip = true
  end
end


-- ===== Shuttle Fleet aa3745 (124 chars) =====
function onUpdate()
  if self.is_face_down == true then
    self.tooltip = false
  else self.tooltip = true
  end
end


-- ===== Artillery 3c6492 (124 chars) =====
function onUpdate()
  if self.is_face_down == true then
    self.tooltip = false
  else self.tooltip = true
  end
end


-- ===== Holoprojectors c42af8 (124 chars) =====
function onUpdate()
  if self.is_face_down == true then
    self.tooltip = false
  else self.tooltip = true
  end
end


-- ===== Troop Transports 57bb62 (123 chars) =====
function onUpdate()
  if self.is_face_down == true then
    self.tooltip = false
  else self.tooltip = true 
  end
end

-- ===== Rise of IX Expansion 6b4579 (1202 chars) =====
function getCard(nameT)
  return cardLib[nameT[1]]
end

cardLib = {
  ["Artillery"] = {Type = "Tech", Spice = 1, Rival = 0},

  ["Sonic Snoopers"] = {Type = "Tech", Spice = 2, Rival = 1},
  ["Troop Transports"] = {Type = "Tech", Spice = 2, Rival = 1},
  ["Memocorders"] = {Type = "Tech", Spice = 2, Rival = 1},
  ["Windtraps"] = {Type = "Tech", Spice = 2, Rival = 1},
  ["Minimic Film"] = {Type = "Tech", Spice = 2, Rival = 0},

  ["Detonation Devices"] = {Type = "Tech", Spice = 3, Rival = 1},
  ["Training Drones"] = {Type = "Tech", Spice = 3, Rival = 1},
  ["Holoprojectors"] = {Type = "Tech", Spice = 3, Rival = 0},
  ["Disposal Facility"] = {Type = "Tech", Spice = 3, Rival = 0},

  ["Chaumurky"] = {Type = "Tech", Spice = 4, Rival = 1},
  ["Spy Satellites"] = {Type = "Tech", Spice = 4, Rival = 1},
  ["Restricted Ordance"] = {Type = "Tech", Spice = 4, Rival = 0},

  ["Invasion Ships"] = {Type = "Tech", Spice = 5, Rival = 1},
  ["Spaceport"] = {Type = "Tech", Spice = 5, Rival = 0},

  ["Shuttle Fleet"] = {Type = "Tech", Spice = 6, Rival = 1},
  ["Holtzman Engine"] = {Type = "Tech", Spice = 6, Rival = 1},

  ["Flagship"] = {Type = "Tech", Spice = 8, Rival = 1}
}

-- ===== Tessia Vernius 1244ec (2426 chars) =====
snooperTokens = {"48697e", "f81ccf", "4b913e", "e1d7b4"}
snooperPosition = {{-12.09, 1.3, 11.20}, {-12.09, 1.3, 5.10}, {-12.09, 1.3, -1.05}, {-12.10, 1.3, -7.05}}
snooperRotation = {{0.00, 179.97, 353.67}, {0.00, 179.97, 353.73}, {0.00, 179.97, 353.72}, {0.00, 179.98, 353.77}}

function claimButton()
  self.createButton({
     click_function = "claimLeader",
     function_owner = self,
     label          = "Claim Leader",
     position       = {0,0.2,0.4},
     rotation       = {0, 0, 0},
     scale          = {0.5, 1, 0.5},
     width          = 700,
     height         = 150,
     tooltip        = "",
     font_color     = {1, 1, 1},
     font_size      = 85,
     color          = "Black"
     })
end

function claimLabel()
  self.createButton({
     click_function = "claimLeader",
     function_owner = self,
     label          = "Claim Leader",
     position       = {0,0.2,0.4},
     rotation       = {0, 0, 0},
     scale          = {0.5, 1, 0.5},
     width          = 700,
     height         = 150,
     tooltip        = "",
     font_color     = {1, 1, 1},
     font_size      = 85,
     color          = "Black"
     })
end

function claimLeader(GO, color)
  if color == "Red" then
    leaderPos = {-40.00, 2, -12.89}
    leaderRot = {0.00, 180.00, 0.00}
    GO.setPositionSmooth(leaderPos)
    GO.setRotationSmooth(leaderRot)
    GO.clearButtons()
    snooperPlacement()
  elseif color == "Blue" then
    leaderPos = {-15.00, 2, -12.89}
    leaderRot = {0.00, 180.00, 0.00}
    GO.setPositionSmooth(leaderPos)
    GO.setRotationSmooth(leaderRot)
    GO.clearButtons()
    snooperPlacement()
  elseif color == "Orange" then
    leaderPos = {15.00, 2, -12.89}
    leaderRot = {0.00, 180.00, 0.00}
    GO.setPositionSmooth(leaderPos)
    GO.setRotationSmooth(leaderRot)
    GO.clearButtons()
    snooperPlacement()
  elseif color == "Green" then
    leaderPos = {40.00, 2, -12.89}
    leaderRot = {0.00, 180.00, 0.00}
    GO.setPositionSmooth(leaderPos)
    GO.setRotationSmooth(leaderRot)
    GO.clearButtons()
    snooperPlacement()
  else
    printToAll("Cannot Select Leader Until the Player is Seated!")
  end
end

function snooperPlacement()
  for i=1,4 do
    getObjectFromGUID(snooperTokens[i]).setPositionSmooth(snooperPosition[i])
    getObjectFromGUID(snooperTokens[i]).setRotationSmooth(snooperRotation[i])
  end
end

-- ===== Archduke Armand Ecaz 06b6eb (1830 chars) =====
function claimButton()
  self.createButton({
     click_function = "claimLeader",
     function_owner = self,
     label          = "Claim Leader",
     position       = {0,0.2,0.4},
     rotation       = {0, 0, 0},
     scale          = {0.5, 1, 0.5},
     width          = 700,
     height         = 150,
     tooltip        = "",
     font_color     = {1, 1, 1},
     font_size      = 85,
     color          = "Black"
     })
end

function claimLabel()
  self.createButton({
     click_function = "claimLeader",
     function_owner = self,
     label          = "Claim Leader",
     position       = {0,0.2,0.4},
     rotation       = {0, 0, 0},
     scale          = {0.5, 1, 0.5},
     width          = 700,
     height         = 150,
     tooltip        = "",
     font_color     = {1, 1, 1},
     font_size      = 85,
     color          = "Black"
     })
end

function claimLeader(GO, color)
  if color == "Red" then
    leaderPos = {-40.00, 2, -12.89}
    leaderRot = {0.00, 180.00, 0.00}
    GO.setPositionSmooth(leaderPos)
    GO.setRotationSmooth(leaderRot)
    GO.clearButtons()
  elseif color == "Blue" then
    leaderPos = {-15.00, 2, -12.89}
    leaderRot = {0.00, 180.00, 0.00}
    GO.setPositionSmooth(leaderPos)
    GO.setRotationSmooth(leaderRot)
    GO.clearButtons()
  elseif color == "Orange" then
    leaderPos = {15.00, 2, -12.89}
    leaderRot = {0.00, 180.00, 0.00}
    GO.setPositionSmooth(leaderPos)
    GO.setRotationSmooth(leaderRot)
    GO.clearButtons()
  elseif color == "Green" then
    leaderPos = {40.00, 2, -12.89}
    leaderRot = {0.00, 180.00, 0.00}
    GO.setPositionSmooth(leaderPos)
    GO.setRotationSmooth(leaderRot)
    GO.clearButtons()
  else
    printToAll("Cannot Select Leader Until the Player is Seated!")
  end
end

-- ===== Ilesa Ecaz 952a13 (1830 chars) =====
function claimButton()
  self.createButton({
     click_function = "claimLeader",
     function_owner = self,
     label          = "Claim Leader",
     position       = {0,0.2,0.4},
     rotation       = {0, 0, 0},
     scale          = {0.5, 1, 0.5},
     width          = 700,
     height         = 150,
     tooltip        = "",
     font_color     = {1, 1, 1},
     font_size      = 85,
     color          = "Black"
     })
end

function claimLabel()
  self.createButton({
     click_function = "claimLeader",
     function_owner = self,
     label          = "Claim Leader",
     position       = {0,0.2,0.4},
     rotation       = {0, 0, 0},
     scale          = {0.5, 1, 0.5},
     width          = 700,
     height         = 150,
     tooltip        = "",
     font_color     = {1, 1, 1},
     font_size      = 85,
     color          = "Black"
     })
end

function claimLeader(GO, color)
  if color == "Red" then
    leaderPos = {-40.00, 2, -12.89}
    leaderRot = {0.00, 180.00, 0.00}
    GO.setPositionSmooth(leaderPos)
    GO.setRotationSmooth(leaderRot)
    GO.clearButtons()
  elseif color == "Blue" then
    leaderPos = {-15.00, 2, -12.89}
    leaderRot = {0.00, 180.00, 0.00}
    GO.setPositionSmooth(leaderPos)
    GO.setRotationSmooth(leaderRot)
    GO.clearButtons()
  elseif color == "Orange" then
    leaderPos = {15.00, 2, -12.89}
    leaderRot = {0.00, 180.00, 0.00}
    GO.setPositionSmooth(leaderPos)
    GO.setRotationSmooth(leaderRot)
    GO.clearButtons()
  elseif color == "Green" then
    leaderPos = {40.00, 2, -12.89}
    leaderRot = {0.00, 180.00, 0.00}
    GO.setPositionSmooth(leaderPos)
    GO.setRotationSmooth(leaderRot)
    GO.clearButtons()
  else
    printToAll("Cannot Select Leader Until the Player is Seated!")
  end
end

-- ===== "Princess" Yuna Moritani 1a4dcc (1830 chars) =====
function claimButton()
  self.createButton({
     click_function = "claimLeader",
     function_owner = self,
     label          = "Claim Leader",
     position       = {0,0.2,0.4},
     rotation       = {0, 0, 0},
     scale          = {0.5, 1, 0.5},
     width          = 700,
     height         = 150,
     tooltip        = "",
     font_color     = {1, 1, 1},
     font_size      = 85,
     color          = "Black"
     })
end

function claimLabel()
  self.createButton({
     click_function = "claimLeader",
     function_owner = self,
     label          = "Claim Leader",
     position       = {0,0.2,0.4},
     rotation       = {0, 0, 0},
     scale          = {0.5, 1, 0.5},
     width          = 700,
     height         = 150,
     tooltip        = "",
     font_color     = {1, 1, 1},
     font_size      = 85,
     color          = "Black"
     })
end

function claimLeader(GO, color)
  if color == "Red" then
    leaderPos = {-40.00, 2, -12.89}
    leaderRot = {0.00, 180.00, 0.00}
    GO.setPositionSmooth(leaderPos)
    GO.setRotationSmooth(leaderRot)
    GO.clearButtons()
  elseif color == "Blue" then
    leaderPos = {-15.00, 2, -12.89}
    leaderRot = {0.00, 180.00, 0.00}
    GO.setPositionSmooth(leaderPos)
    GO.setRotationSmooth(leaderRot)
    GO.clearButtons()
  elseif color == "Orange" then
    leaderPos = {15.00, 2, -12.89}
    leaderRot = {0.00, 180.00, 0.00}
    GO.setPositionSmooth(leaderPos)
    GO.setRotationSmooth(leaderRot)
    GO.clearButtons()
  elseif color == "Green" then
    leaderPos = {40.00, 2, -12.89}
    leaderRot = {0.00, 180.00, 0.00}
    GO.setPositionSmooth(leaderPos)
    GO.setRotationSmooth(leaderRot)
    GO.clearButtons()
  else
    printToAll("Cannot Select Leader Until the Player is Seated!")
  end
end

-- ===== Prince Rhombur Vernius 717776 (1830 chars) =====
function claimButton()
  self.createButton({
     click_function = "claimLeader",
     function_owner = self,
     label          = "Claim Leader",
     position       = {0,0.2,0.4},
     rotation       = {0, 0, 0},
     scale          = {0.5, 1, 0.5},
     width          = 700,
     height         = 150,
     tooltip        = "",
     font_color     = {1, 1, 1},
     font_size      = 85,
     color          = "Black"
     })
end

function claimLabel()
  self.createButton({
     click_function = "claimLeader",
     function_owner = self,
     label          = "Claim Leader",
     position       = {0,0.2,0.4},
     rotation       = {0, 0, 0},
     scale          = {0.5, 1, 0.5},
     width          = 700,
     height         = 150,
     tooltip        = "",
     font_color     = {1, 1, 1},
     font_size      = 85,
     color          = "Black"
     })
end

function claimLeader(GO, color)
  if color == "Red" then
    leaderPos = {-40.00, 2, -12.89}
    leaderRot = {0.00, 180.00, 0.00}
    GO.setPositionSmooth(leaderPos)
    GO.setRotationSmooth(leaderRot)
    GO.clearButtons()
  elseif color == "Blue" then
    leaderPos = {-15.00, 2, -12.89}
    leaderRot = {0.00, 180.00, 0.00}
    GO.setPositionSmooth(leaderPos)
    GO.setRotationSmooth(leaderRot)
    GO.clearButtons()
  elseif color == "Orange" then
    leaderPos = {15.00, 2, -12.89}
    leaderRot = {0.00, 180.00, 0.00}
    GO.setPositionSmooth(leaderPos)
    GO.setRotationSmooth(leaderRot)
    GO.clearButtons()
  elseif color == "Green" then
    leaderPos = {40.00, 2, -12.89}
    leaderRot = {0.00, 180.00, 0.00}
    GO.setPositionSmooth(leaderPos)
    GO.setRotationSmooth(leaderRot)
    GO.clearButtons()
  else
    printToAll("Cannot Select Leader Until the Player is Seated!")
  end
end

-- ===== Viscount Hundro Moritani ceee90 (1830 chars) =====
function claimButton()
  self.createButton({
     click_function = "claimLeader",
     function_owner = self,
     label          = "Claim Leader",
     position       = {0,0.2,0.4},
     rotation       = {0, 0, 0},
     scale          = {0.5, 1, 0.5},
     width          = 700,
     height         = 150,
     tooltip        = "",
     font_color     = {1, 1, 1},
     font_size      = 85,
     color          = "Black"
     })
end

function claimLabel()
  self.createButton({
     click_function = "claimLeader",
     function_owner = self,
     label          = "Claim Leader",
     position       = {0,0.2,0.4},
     rotation       = {0, 0, 0},
     scale          = {0.5, 1, 0.5},
     width          = 700,
     height         = 150,
     tooltip        = "",
     font_color     = {1, 1, 1},
     font_size      = 85,
     color          = "Black"
     })
end

function claimLeader(GO, color)
  if color == "Red" then
    leaderPos = {-40.00, 2, -12.89}
    leaderRot = {0.00, 180.00, 0.00}
    GO.setPositionSmooth(leaderPos)
    GO.setRotationSmooth(leaderRot)
    GO.clearButtons()
  elseif color == "Blue" then
    leaderPos = {-15.00, 2, -12.89}
    leaderRot = {0.00, 180.00, 0.00}
    GO.setPositionSmooth(leaderPos)
    GO.setRotationSmooth(leaderRot)
    GO.clearButtons()
  elseif color == "Orange" then
    leaderPos = {15.00, 2, -12.89}
    leaderRot = {0.00, 180.00, 0.00}
    GO.setPositionSmooth(leaderPos)
    GO.setRotationSmooth(leaderRot)
    GO.clearButtons()
  elseif color == "Green" then
    leaderPos = {40.00, 2, -12.89}
    leaderRot = {0.00, 180.00, 0.00}
    GO.setPositionSmooth(leaderPos)
    GO.setRotationSmooth(leaderRot)
    GO.clearButtons()
  else
    printToAll("Cannot Select Leader Until the Player is Seated!")
  end
end

-- ===== CardCustom 255a85 (1561 chars) =====
playerBoards = {"a0fa97", "042887", "e435ab", "f8a49f"}
defaultColorList = {"Red", "Blue", "Orange", "Green"}

playerSpot = 0

function onCollisionEnter(info)
  playerSpot = 0
  local mentatColor = ""
  if info.collision_object.getDescription() == "Agent" then
    if info.collision_object.getName() == "Mentat" then
      mentatColor = getObjectFromGUID("e7e9b1").getVar("playerColor")
    end
    if mentatColor == "Red" or info.collision_object.getName() == "Red Agent" or info.collision_object.getName() == "Red Swordmaster" then
      playerSpot = 1
    elseif mentatColor == "Blue" or info.collision_object.getName() == "Blue Agent" or info.collision_object.getName() == "Blue Swordmaster" then
      playerSpot = 2
    elseif mentatColor == "Orange" or info.collision_object.getName() == "Orange Agent" or info.collision_object.getName() == "Orange Swordmaster" then
      playerSpot = 3
    elseif mentatColor == "Green" or info.collision_object.getName() == "Green Agent" or info.collision_object.getName() == "Green Swordmaster" then
      playerSpot = 4
    end
    if playerSpot != 0 and Global.getVar("rivals")[playerSpot] != 1 then
       startLuaCoroutine(self, "boardAction")
    end
  end
end

function boardAction()
  for i=1, 3 do
    getObjectFromGUID(playerBoards[playerSpot]).call("spendOneSolaris",{})

    local Time = os.clock() + 1.0
     while os.clock() < Time do
       coroutine.yield(0)
     end
  end

  getObjectFromGUID(playerBoards[playerSpot]).call("addDreadnought",{})

  return 1
end

-- ===== CardCustom 61f233 (1352 chars) =====
playerBoards = {"a0fa97", "042887", "e435ab", "f8a49f"}
defaultColorList = {"Red", "Blue", "Orange", "Green"}

playerSpot = 0

function onCollisionEnter(info)
  playerSpot = 0
  local mentatColor = ""
  if info.collision_object.getDescription() == "Agent" then
    if info.collision_object.getName() == "Mentat" then
      mentatColor = getObjectFromGUID("e7e9b1").getVar("playerColor")
    end
    if mentatColor == "Red" or info.collision_object.getName() == "Red Agent" or info.collision_object.getName() == "Red Swordmaster" then
      playerSpot = 1
    elseif mentatColor == "Blue" or info.collision_object.getName() == "Blue Agent" or info.collision_object.getName() == "Blue Swordmaster" then
      playerSpot = 2
    elseif mentatColor == "Orange" or info.collision_object.getName() == "Orange Agent" or info.collision_object.getName() == "Orange Swordmaster" then
      playerSpot = 3
    elseif mentatColor == "Green" or info.collision_object.getName() == "Green Agent" or info.collision_object.getName() == "Green Swordmaster" then
      playerSpot = 4
    end
    if playerSpot != 0 and Global.getVar("rivals")[playerSpot] != 1 then
       startLuaCoroutine(self, "boardAction")
    end
  end
end

function boardAction()
  getObjectFromGUID(playerBoards[playerSpot]).call("takeOneSolaris",{})

  return 1
end

-- ===== CardCustom 0c0689 (1435 chars) =====
playerBoards = {"a0fa97", "042887", "e435ab", "f8a49f"}
defaultColorList = {"Red", "Blue", "Orange", "Green"}

playerSpot = 0

function onCollisionEnter(info)
  if info.collision_object.getDescription() == "Agent" then
    if info.collision_object.getName() == "Mentat" then
      mentatColor = getObjectFromGUID("e7e9b1").getVar("playerColor")
    end

    playerSpot = 0

    if mentatColor == "Red" or info.collision_object.getName() == "Red Agent" or info.collision_object.getName() == "Red Swordmaster" then
      playerSpot = 1
    elseif mentatColor == "Blue" or info.collision_object.getName() == "Blue Agent" or info.collision_object.getName() == "Blue Swordmaster" then
      playerSpot = 2
    elseif mentatColor == "Orange" or info.collision_object.getName() == "Orange Agent" or info.collision_object.getName() == "Orange Swordmaster" then
      playerSpot = 3
    elseif mentatColor == "Green" or info.collision_object.getName() == "Green Agent" or info.collision_object.getName() == "Green Swordmaster" then
      playerSpot = 4
    end
    if playerSpot != 0 and Global.getVar("rivals")[playerSpot] != 1 then
      startLuaCoroutine(self, "boardAction")
    end
  end
end

function boardAction()
  for i=1, 5 do
    getObjectFromGUID(playerBoards[playerSpot]).call("spendOneSolaris",{})

    local Time = os.clock() + 1.0
     while os.clock() < Time do
       coroutine.yield(0)
     end
  end
  return 1
end

-- ===== CardCustom 220b29 (1900 chars) =====
playerBoards = {"a0fa97", "042887", "e435ab", "f8a49f"}
defaultColorList = {"Red", "Blue", "Orange", "Green"}
mentatPos = {{-45.38, 2, -19.66},{-19.99, 2, -19.80},{9.93, 2, -19.82},{34.72, 2, -19.91}}

playerSpot = 0

function onCollisionEnter(info)
  playerSpot = 0

  if info.collision_object.getDescription() == "Agent" then
    if info.collision_object.getName() != "Mentat" then
     if info.collision_object.getName() == "Red Agent" or info.collision_object.getName() == "Red Swordmaster" then
      playerSpot = 1
     elseif info.collision_object.getName() == "Blue Agent" or info.collision_object.getName() == "Blue Swordmaster" then
      playerSpot = 2
     elseif info.collision_object.getName() == "Orange Agent" or info.collision_object.getName() == "Orange Swordmaster" then
      playerSpot = 3
     elseif info.collision_object.getName() == "Green Agent" or info.collision_object.getName() == "Green Swordmaster" then
      playerSpot = 4
     end
    end
    if playerSpot != 0 and Global.getVar("rivals")[playerSpot] != 1 then
      startLuaCoroutine(self, "boardAction")
      getObjectFromGUID(playerBoards[playerSpot]).call("drawCard",{})
      getObjectFromGUID("e7e9b1").setPositionSmooth(mentatPos[playerSpot],false,true)
    end
  end
end

function boardAction()
  if getObjectFromGUID("2da390").getVar("difficultyLevel") == 1 then
   for i=1, 2 do
    getObjectFromGUID(playerBoards[playerSpot]).call("spendOneSolaris",{})

    local Time = os.clock() + 1.0
     while os.clock() < Time do
       coroutine.yield(0)
     end
   end
 elseif getObjectFromGUID("2da390").getVar("difficultyLevel") > 1 then
   for i=1, 5 do
    getObjectFromGUID(playerBoards[playerSpot]).call("spendOneSolaris",{})

    local Time = os.clock() + 1.0
     while os.clock() < Time do
       coroutine.yield(0)
     end
   end
 end
  return 1
end

-- ===== CardCustom d1d63b (1592 chars) =====
playerBoards = {"a0fa97", "042887", "e435ab", "f8a49f"}
defaultColorList = {"Red", "Blue", "Orange", "Green"}
mentatPos = {{-45.38, 2, -19.66},{-19.99, 2, -19.80},{9.93, 2, -19.82},{34.72, 2, -19.91}}

playerSpot = 0

function onCollisionEnter(info)
  playerSpot = 0

  local swordTokens = Global.getVar("swordMasterTokens")
  local swordBoardPos = getObjectFromGUID("2da390").getVar("councilorSpots")
  local mentatColor = ""

  if info.collision_object.getDescription() == "Agent" then
    if info.collision_object.getName() == "Mentat" then
      mentatColor = getObjectFromGUID("e7e9b1").getVar("playerColor")
    end
    if mentatColor == "Red" or info.collision_object.getName() == "Red Agent" then
      playerSpot = 1
    elseif mentatColor == "Blue" or info.collision_object.getName() == "Blue Agent" then
      playerSpot = 2
    elseif mentatColor == "Orange" or info.collision_object.getName() == "Orange Agent" then
      playerSpot = 3
    elseif mentatColor == "Green" or info.collision_object.getName() == "Green Agent" then
      playerSpot = 4
    end
    if playerSpot != 0 and Global.getVar("rivals")[playerSpot] != 1 then
      startLuaCoroutine(self, "boardAction")
      getObjectFromGUID(swordTokens[playerSpot]).setPositionSmooth(swordBoardPos[playerSpot],fasle,true)
    end
  end
end

function boardAction()
  for i=1, 8 do
    getObjectFromGUID(playerBoards[playerSpot]).call("spendOneSolaris",{})

    local Time = os.clock() + 1.00
     while os.clock() < Time do
       coroutine.yield(0)
     end
  end
  return 1
end

-- ===== Custom_Token ab1ce9 (9977 chars) =====
techZones = {"b9349c", "b42a9c", "9c3da8"}
negZone = "5e4ef3"

tileOffset = {-4.50, -1.50, 1.50, 4.50}
playerBoard = {"a0fa97", "042887", "e435ab", "f8a49f"}

ixBag = "6b4579"

colorRef = {["Red"] = 1, ["Blue"] = 2, ["Orange"] = 3, ["Green"] = 4}

redSupply = {-49.00, 3.5, -22.00}
blueSupply = {-6.00, 3.5, -22.00}
orangeSupply = {6.00, 3.5, -22.00}
greenSupply = {49.00, 3.5, -22.00}

function onload()
  buttonRed = 25
  buttonGreen = 62
  buttonBlue = 52

  buttonRed = buttonRed/255
  buttonGreen = buttonGreen/255
  buttonBlue = buttonBlue/255

  self.createButton({
     click_function = "buyTileOne",
     function_owner = self,
     label          = "Acquire",
     position       = {1.8,0.2,-1.3},
     rotation       = {0, 0, 0},
     scale          = {0.65, 1, 0.65},
     width          = 450,
     height         = 125,
     tooltip        = "",
     font_color     = {1, 1, 1},
     font_size      = 75,
     color          = {buttonRed, buttonGreen, buttonBlue},
     })
  self.createButton({
    click_function = "buyTileTwo",
    function_owner = self,
    label          = "Acquire",
    position       = {1.8, 0.2, -0.2},
    rotation       = {0, 0, 0},
    scale          = {0.65, 1, 0.65},
    width          = 450,
    height         = 125,
    tooltip        = "",
    font_color     = {1, 1, 1},
    font_size      = 75,
    color          = {buttonRed, buttonGreen, buttonBlue},
    })
  self.createButton({
     click_function = "buyTileThree",
     function_owner = self,
     label          = "Acquire",
     position       = {1.8, 0.2, 0.9},
     rotation       = {0, 0, 0},
     scale          = {0.65, 1, 0.65},
     width          = 450,
     height         = 125,
     tooltip        = "",
     font_color     = {1, 1, 1},
     font_size      = 75,
     color          = {buttonRed, buttonGreen, buttonBlue},
     })
  self.createButton({
    click_function = "sendNeg",
    function_owner = self,
    label          = "Send Negotiator",
    position       = {-1.25, 0.2, 0.60},
    rotation       = {0, 0, 0},
    scale          = {0.5, 1, 0.5},
    width          = 875,
    height         = 125,
    tooltip        = "",
    font_color     = {0.9, 1, 0.9},
    font_size      = 90,
    color          = {buttonRed, buttonGreen, buttonBlue},
    })

    buttonRed = 148
    buttonGreen = 134
    buttonBlue = 93

    buttonRed = buttonRed/255
    buttonGreen = buttonGreen/255
    buttonBlue = buttonBlue/255

  self.createButton({
    click_function = "rentNeg",
    function_owner = self,
    label          = "Return Negotiator",
    position       = {-1.25, 0.2, 0.8},
    rotation       = {0, 0, 0},
    scale          = {0.5, 1, 0.5},
    width          = 875,
    height         = 125,
    tooltip        = "",
    font_color     = {1, 1, 1},
    font_size      = 90,
    color          = {buttonRed, buttonGreen, buttonBlue},
    })

  if getObjectFromGUID("784534").getVar("inProgress") == 1 then
    self.setPosition({17.67, 1.03, 10.72})
    Wait.frames(function()
        --tileStackRefresh()
    end,60)
  end
end

function tileStackRefresh()
  for i=1, 3 do
    tileGroup = getObjectFromGUID(techZones[i]).getObjects()
    for _, groupObj in ipairs(tileGroup) do
      if groupObj.getDescription() == "Tech" then
        local tilePos = groupObj.getPosition()
        tilePos.y = tilePos.y + 0.5
        groupObj.setPositionSmooth(tilePos, false,true)
      end
    end
  end
end

function sendNeg(GO, color)
  getObjectFromGUID(playerBoard[colorRef[color]]).call("sendNegotiator")
end

function rentNeg(GO, color)
  negotiatorArea = getObjectFromGUID("5e4ef3").getObjects()

  local resetNegSupply = {0, 0, 0}

  if color == "Red" then
    resetNegSupply = {redSupply[1] + (math.random()/2), redSupply[2], redSupply[3] + (math.random()/2)}
  elseif color == "Blue" then
    resetNegSupply = {blueSupply[1] + (math.random()/2), blueSupply[2], blueSupply[3] + (math.random()/2)}
  elseif color == "Orange" then
    resetNegSupply = {orangeSupply[1] + (math.random()/2), orangeSupply[2], orangeSupply[3] + (math.random()/2)}
  elseif color == "Green" then
    resetNegSupply = {greenSupply[1] + (math.random()/2), greenSupply[2], greenSupply[3] + (math.random()/2)}
  end

  for _, item in ipairs(negotiatorArea) do
    if item.tag == "Block" and item.getName() == color then
      --item.setPositionSmooth(resetNegSupply, false, true)
      broadcastToAll(color .. " Player returned a Negotiator from IX", stringColorToRGB(colodr))
      item.setPositionSmooth(resetNegSupply)
      break
    end
  end
end

function buyTileOne(GO, color)
  local techAcquire = ""
  local tilePlacement = {}
  local techRot = {}
  local stackCount = 0

  for _, techObject in ipairs(getObjectFromGUID(techZones[1]).getObjects()) do
    techRot = techObject.getRotation()
    if techObject.getDescription() == "Tech" and techObject.getName() != "" and techObject.getName() != nil then
      stackCount = stackCount + 1
      if techRot.z > 350 or techRot.z < 10 then
        techAcquire = techObject
      end
    end
  end

  if techAcquire != "" then
    broadcastToAll(color .. " Player has acquired the " .. techAcquire.getName() .. " tech", stringColorToRGB(color))
    Wait.frames(function()
      broadcastToAll(color .. " Player must pay the required Spice amount", stringColorToRGB(color))
    end, 75)

    tilePlacement = getObjectFromGUID(playerBoard[colorRef[color]]).getPosition()
    tilePlacement.x = tilePlacement.x + math.random(-4,4)
    tilePlacement.y = 2
    tilePlacement.z = tilePlacement.z + math.random(-1,1)
    techAcquire.setPositionSmooth(tilePlacement)

    if stackCount != 1 then
      tileRefresh(1)
    end
  end
end

function buyTileTwo(GO, color)
  local techAcquire = ""
  local tilePlacement = {}
  local techRot = {}
  local stackCount = 0

  for _, techObject in ipairs(getObjectFromGUID(techZones[2]).getObjects()) do
    techRot = techObject.getRotation()
    if techObject.getDescription() == "Tech" and techObject.getName() != "" and techObject.getName() != nil then
      stackCount = stackCount + 1
      if techRot.z > 350 or techRot.z < 10 then
        techAcquire = techObject
      end
    end
  end

  if techAcquire != "" then
    broadcastToAll(color .. " Player has acquired the " .. techAcquire.getName() .. " tech", stringColorToRGB(color))
    Wait.frames(function()
      broadcastToAll(color .. " Player must pay the required Spice amount", stringColorToRGB(color))
    end, 75)

    tilePlacement = getObjectFromGUID(playerBoard[colorRef[color]]).getPosition()
    tilePlacement.x = tilePlacement.x + math.random(-4,4)
    tilePlacement.y = 2
    tilePlacement.z = tilePlacement.z + math.random(-1,1)
    techAcquire.setPositionSmooth(tilePlacement)

    if stackCount != 1 then
      tileRefresh(2)
    end
  end
end

function buyTileThree(GO, color)
  local techAcquire = ""
  local tilePlacement = {}
  local techRot = {}
  local stackCount = 0

  for _, techObject in ipairs(getObjectFromGUID(techZones[3]).getObjects()) do
    techRot = techObject.getRotation()
    if techObject.getDescription() == "Tech" and techObject.getName() != "" and techObject.getName() != nil then
      stackCount = stackCount + 1
      if techRot.z > 350 or techRot.z < 10 then
        techAcquire = techObject
      end
    end
  end

  if techAcquire != "" then
    broadcastToAll(color .. " Player has acquired the " .. techAcquire.getName() .. " tech", stringColorToRGB(color))
    Wait.frames(function()
      broadcastToAll(color .. " Player must pay the required Spice amount", stringColorToRGB(color))
    end, 75)

    tilePlacement = getObjectFromGUID(playerBoard[colorRef[color]]).getPosition()
    tilePlacement.x = tilePlacement.x + math.random(-4,4)
    tilePlacement.y = 2
    tilePlacement.z = tilePlacement.z + math.random(-1,1)
    techAcquire.setPositionSmooth(tilePlacement)

    if stackCount != 1 then
      tileRefresh(3)
    end
  end
end

function tileRefresh(techIndex)
  local nextTech = 0
  local topFlip = ""
  local techPos = {}

  for _, techObject in ipairs(getObjectFromGUID(techZones[techIndex]).getObjects()) do
    techPos = techObject.getPosition()
    if techObject.getDescription() != "IX" then
      if techPos.y > nextTech then
        topFlip = techObject.getGUID()
        nextTech = techPos.y
      end
    end
  end

  getObjectFromGUID(topFlip).flip()
end

function phaseTileCheck()
  startLuaCoroutine(self, "phaseTileCheckStart")
end

function phaseTileCheckStart()
  for i=1, 3 do
    local nextTech = 0
    local topFlip = ""
    --local techRot = {}
    --local techPos = {}
    local techFlip = 0

    for _, techObject in ipairs(getObjectFromGUID(techZones[i]).getObjects()) do
      local Time = os.clock() + 0.10
        while os.clock() < Time do
        coroutine.yield(0)
        end
      local techPos = techObject.getPosition()
      local techRot = techObject.getRotation()
      if techObject.getDescription() != "IX" then
        if techRot.z > 350 or techRot.z < 10 then
          techFlip = 1
        end
        if techPos.y > nextTech then
          topFlip = techObject.getGUID()
          nextTech = techPos.y
        end
      end
    end
    local Time = os.clock() + 0.10
      while os.clock() < Time do
      coroutine.yield(0)
      end

    local techRot = getObjectFromGUID(topFlip).getRotation()
    if getObjectFromGUID(topFlip).getDescription() == "Tech" and getObjectFromGUID(topFlip).getName() != "" and getObjectFromGUID(topFlip).getName() != nil then
      if techRot.z < 350 and techRot.z > 10 and techFlip == 0 then
        getObjectFromGUID(topFlip).flip()
      end
    end
  end

  return 1
end

-- ===== CardCustom e193ce (8791 chars) =====
--Counting Bowl    by MrStump
timerID = ""

validCountItemListRed = {
    ["Red"] = 1,
}

validCountItemListBlue = {
    ["Blue"] = 1,
}

validCountItemListOrange = {
    ["Orange"] = 1,
}

validCountItemListGreen = {
    ["Green"] = 1,
}

function onLoad()
    timerIDRed = self.getGUID()..math.random(9999999999999)
    timerIDBlue = self.getGUID()..math.random(9999999999999)
    timerIDOrange = self.getGUID()..math.random(9999999999999)
    timerIDGreen = self.getGUID()..math.random(9999999999999)

    --Red
    self.createButton({
        label="Red: ", click_function="none", function_owner=self,
        position={-0.5,0.3,0.05}, rotation={0,0,0}, height=00, width=0,
        --position={0.6,0.2,-1.45}, rotation={0,0,0}, height=00, width=0,
        font_color={1,0,0}, scale = {0.3,0.3,0.3}, font_size=200
    })
    self.createButton({
        label="0", click_function="none", function_owner=self,
        position={-0.2,0.3,0.05}, rotation={0,0,0}, height=00, width=0,
        --position={0.6,0.2,-1.45}, rotation={0,0,0}, height=00, width=0,
        font_color={1,1,1}, scale = {0.3,0.3,0.3}, font_size=200
    })

    --Blue
    self.createButton({
        label="Blue: ", click_function="none", function_owner=self,
        position={-0.5,0.3,0.35}, rotation={0,0,0}, height=00, width=0,
        font_color={0,0,1}, scale = {0.3,0.3,0.3}, font_size=200
    })
    self.createButton({
        label="0", click_function="none", function_owner=self,
        position={-0.2,0.3,0.35}, rotation={0,0,0}, height=00, width=0,
        --position={0.6,0.2,-1.45}, rotation={0,0,0}, height=00, width=0,
        font_color={1,1,1}, scale = {0.3,0.3,0.3}, font_size=200
    })

    --Orange
    self.createButton({
        label="Orange: ", click_function="none", function_owner=self,
        position={-0.5,0.3,0.65}, rotation={0,0,0}, height=00, width=0,
        font_color={0.9,0.5,0.1}, scale = {0.3,0.3,0.3}, font_size=200
    })
    self.createButton({
        label="0", click_function="none", function_owner=self,
        position={-0.2,0.3,0.65}, rotation={0,0,0}, height=00, width=0,
        --position={0.6,0.2,-1.45}, rotation={0,0,0}, height=00, width=0,
        font_color={1,1,1}, scale = {0.3,0.3,0.3}, font_size=200
    })

    --Green
    self.createButton({
        label="Green: ", click_function="none", function_owner=self,
        position={-0.5,0.3,0.95}, rotation={0,0,0}, height=00, width=0,
        font_color={0,1,0}, scale = {0.3,0.3,0.3}, font_size=200
    })
    self.createButton({
        label="0", click_function="none", function_owner=self,
        position={-0.2,0.3,0.9}, rotation={0,0,0}, height=00, width=0,
        --position={0.6,0.2,-1.45}, rotation={0,0,0}, height=00, width=0,
        font_color={1,1,1}, scale = {0.3,0.3,0.3}, font_size=200
    })

    Timer.create({
        identifier=timerIDRed,
        function_name="countItemsRed", function_owner=self,
        repetitions=0, delay=0.75
    })

    Timer.create({
        identifier=timerIDBlue,
        function_name="countItemsBlue", function_owner=self,
        repetitions=0, delay=0.75
    })

    Timer.create({
        identifier=timerIDOrange,
        function_name="countItemsOrange", function_owner=self,
        repetitions=0, delay=0.75
    })

    Timer.create({
        identifier=timerIDGreen,
        function_name="countItemsGreen", function_owner=self,
        repetitions=0, delay=0.75
    })
end

--Activated once per second, counts items in bowls
function countItemsRed()
    local totalValue = 0
    local itemsInBowl = findItemsInSphere()
    --Go through all items found by the cast
    for _, entry in ipairs(itemsInBowl) do
        --Ignore the bowl
        if entry.hit_object ~= self then
            local tableEntry = validCountItemListRed[entry.hit_object.getName()]
            --Ignore if not in validCountItemList
            if tableEntry ~= nil then
                local descValue = tonumber(entry.hit_object.getDescription())
                local stackMult = math.abs(entry.hit_object.getQuantity())
                --Use value in description if available
                if descValue ~= nil then
                    totalValue = totalValue + descValue * stackMult
                else
                    --Otherwise use the value in validCountItemList
                    totalValue = totalValue + tableEntry * stackMult
                end
            end
        end
    end
    --Updates the number display
    --totalValue = ("Red: " .. totalValue)
    self.editButton({index=1, label=totalValue})
end

function countItemsBlue()
    local totalValue = 0
    local itemsInBowl = findItemsInSphere()
    --Go through all items found by the cast
    for _, entry in ipairs(itemsInBowl) do
        --Ignore the bowl
        if entry.hit_object ~= self then
            local tableEntry = validCountItemListBlue[entry.hit_object.getName()]
            --Ignore if not in validCountItemList
            if tableEntry ~= nil then
                local descValue = tonumber(entry.hit_object.getDescription())
                local stackMult = math.abs(entry.hit_object.getQuantity())
                --Use value in description if available
                if descValue ~= nil then
                    totalValue = totalValue + descValue * stackMult
                else
                    --Otherwise use the value in validCountItemList
                    totalValue = totalValue + tableEntry * stackMult
                end
            end
        end
    end
    --Updates the number display
    --totalValue = ("Blue: " .. totalValue)
    self.editButton({index=3, label=totalValue})
end

function countItemsOrange()
    local totalValue = 0
    local itemsInBowl = findItemsInSphere()
    --Go through all items found by the cast
    for _, entry in ipairs(itemsInBowl) do
        --Ignore the bowl
        if entry.hit_object ~= self then
            local tableEntry = validCountItemListOrange[entry.hit_object.getName()]
            --Ignore if not in validCountItemList
            if tableEntry ~= nil then
                local descValue = tonumber(entry.hit_object.getDescription())
                local stackMult = math.abs(entry.hit_object.getQuantity())
                --Use value in description if available
                if descValue ~= nil then
                    totalValue = totalValue + descValue * stackMult
                else
                    --Otherwise use the value in validCountItemList
                    totalValue = totalValue + tableEntry * stackMult
                end
            end
        end
    end
    --Updates the number display
    --totalValue = ("Orange: " .. totalValue)
    self.editButton({index=5, label=totalValue})
end

function countItemsGreen()
    local totalValue = 0
    local itemsInBowl = findItemsInSphere()
    --Go through all items found by the cast
    for _, entry in ipairs(itemsInBowl) do
        --Ignore the bowl
        if entry.hit_object ~= self then
            local tableEntry = validCountItemListGreen[entry.hit_object.getName()]
            --Ignore if not in validCountItemList
            if tableEntry ~= nil then
                local descValue = tonumber(entry.hit_object.getDescription())
                local stackMult = math.abs(entry.hit_object.getQuantity())
                --Use value in description if available
                if descValue ~= nil then
                    totalValue = totalValue + descValue * stackMult
                else
                    --Otherwise use the value in validCountItemList
                    totalValue = totalValue + tableEntry * stackMult
                end
            end
        end
    end
    --Updates the number display
    --totalValue = ("Green: " .. totalValue)
    self.editButton({index=7, label=totalValue})
end

--Gets the items in the bowl for countItems to count
function findItemsInSphere()
    --Find scaling factor
    local scale = self.getScale()
    --Set position for the sphere
    local pos = self.getPosition()
    --pos.y=pos.y+(1.25*scale.y)
    --Ray trace to get all objects
    return Physics.cast({
        origin=pos, direction={0,1,0}, type=3, max_distance=0,
        size={3.65*scale.x,2.75*scale.y,2.8*scale.z}, --debug=true
    })
end

function onDestroy()
  if timerIDRed ~= nil then
    Timer.destroy(timerIDRed)
  end
  if timerIDBlue ~= nil then
    Timer.destroy(timerIDBlue)
  end
  if timerIDOrange ~= nil then
    Timer.destroy(timerIDOrange)
  end
  if timerIDGreen ~= nil then
    Timer.destroy(timerIDGreen)
  end
end

-- ===== Custom_Tile 7a5cb7 (20888 chars) =====
firstPlayerToken = "784534"

expansionIX = "6b4579"
techTiles = "dee0f6"

--Leaders
expansionLeaders = {"06b6eb", "1244ec", "952a13", "ceee90", "1a4dcc", "717776"}
expansionLeaderPosition = {{-26.00, 1.5, 18.00}, {-26.00, 1.5, 14.00}, {-26.00, 1.5, 10.00}, {26.00, 1.5, 18.00}, {26.00, 1.5, 14.00}, {26.00, 1.5, 10.00}}
snooperTokens = {"4b913e", "48697e", "f81ccf", "e1d7b4"}
snooperPosition = {-26.00, 2.5, 14.00}

--Tokens
dreadnoughtTokens = {["Red"] = {"811db2", "451fe5"}, ["Blue"] = {"69bdc2", "547f60"}, ["Orange"]={"f0c424", "f3af84"}, ["Green"] = {"4798ee", "871e4b"}}
dreadnoughtPosition = {["Red"] = {{-43.20, 1.75, -20.50},{-42.10, 1.75, -20.50}}, ["Blue"] = {{-17.75, 1.75, -20.63},{-16.65, 1.75, -20.63}}, ["Orange"] = {{12.10, 1.75, -20.74},{13.20, 1.75, -20.74}}, ["Green"] = {{36.90, 1.75, -20.75},{38.00, 1.75, -20.75}}}
freighterTokens = {"baab6a", "a79dae", "b4843b", "2c5541"}
freighterPosition = {{-44.30, 1.63, -20.68}, {-18.85, 1.63, -20.81}, {11.00, 1.63, -20.92}, {35.80, 1.63, -20.93}}

--Imperium, Intrigue, Conflict 1, Conflict 2 and Conflict 3
deckExpansions = {"6419f4", "8222e0", "6b55a9", "388e95", "605108"}
deckExpansionPosition = {{-13.00, 3, 17.80}, {-15.50, 3, 17.81}, {-6.57, 3, 17.80}, {-3.73, 3, 17.80}, {-0.89, 3, 17.80}}
deckZones = {"ad3c5a", "e9f30d", "52cc32", "2f3821", "a4f598"}

--Board Overlays (IX, CHOAM and Council)
boardExpansions = {"ab1ce9", "e69504", "26034a"}
boardExpansionPosition = {{17.67, 1.1, 10.72}, {8.40, 1.2, 12.60}, {-0.69, 1.2, 12.60}}
locationImages = {"559089", "255a85", "4c5372", "61f233", "0c0689", "220b29", "d1d63b", "e193ce"}
locationPosition = {{15.66, 1.17, 13.76}, {15.66, 1.17, 11.19}, {6.12, 1.22, 13.83}, {6.12, 1.22, 11.32}, {-3.44, 1.22, 13.81}, {-3.45, 1.22, 11.32}, {1.17, 1.22, 11.33}, {15.51, 1.22, 7.92}}
techTilePosition = {{19.99, 1.25, 14.00}, {19.98, 1.25, 11.15}, {19.98, 1.25, 8.30}}
zoneClearing = {"5b7793", "42028f", "c6d60f", "3893f1", "01a7ba", "a15d7a", "db461b", "a3de8c"}

--Hagal IX (1P, 2P Core)
rivalHagal = {"d708c4", "483b62", "b9bba9"}
imperiumRules = "d80d1f"
riseRules = "dffad3"

--Hagal Imperium (1P, 2P, Core)
imperiumHagalBag = "aaec7d"
imperiumHagalDecks = {"2d887f", "3c22a6", "8f8cc1"}
tempHagalPos = {{-6.00, 1.75, 26.40}, {6.00, 1.75, 26.40}, {0.00, 1.75, 26.40}}

--Epic Game Mode (Control the Spice)
epicExpansion = "9ad14f"


function onLoad()
  --buttonRed = 195
  --buttonGreen = 64
  --buttonBlue = 1

  buttonRed = 20
  buttonGreen = 31
  buttonBlue = 27

  buttonRed = buttonRed/255
  buttonGreen = buttonGreen/255
  buttonBlue = buttonBlue/255

  self.clearButtons()
  self.createButton({
     click_function = "addExpansion",
     function_owner = self,
     label          = "Add Rise of IX Expansion",
     position       = {0.0,0.1,0.0},
     rotation       = {0, 0, 0},
     scale          = {1, 1, 1},
     width          = 3825,
     height         = 925,
     tooltip        = "",
     font_color     = {1, 1, 1},
     font_size      = 300,
    color = {buttonRed, buttonGreen, buttonBlue},
     })
end

function addExpansion()
 
 if getObjectFromGUID(firstPlayerToken).getVar("addImmortalityState") != 1 then

  getObjectFromGUID(firstPlayerToken).call("expansionIxStart", {})

  for _, hagalObject in ipairs(getObjectFromGUID(imperiumHagalBag).getObjects()) do
    if hagalObject.guid == imperiumHagalDecks[1] then
      hagalPull = getObjectFromGUID(imperiumHagalBag).takeObject({guid = hagalObject.guid})
      hagalPull.setPositionSmooth(tempHagalPos[1])
    elseif hagalObject.guid == imperiumHagalDecks[2] then
      hagalPull = getObjectFromGUID(imperiumHagalBag).takeObject({guid = hagalObject.guid})
      hagalPull.setPositionSmooth(tempHagalPos[2])
    elseif hagalObject.guid == imperiumHagalDecks[3] then
      hagalPull = getObjectFromGUID(imperiumHagalBag).takeObject({guid = hagalObject.guid})
      hagalPull.setPositionSmooth(tempHagalPos[3])
      for _, cardObject in ipairs(getObjectFromGUID(imperiumHagalDecks[3]).getObjects()) do
        if cardObject.name == "Rally Troops" or cardObject.name == "Hall of Oratory" then
          cardPull = getObjectFromGUID(imperiumHagalDecks[3]).takeObject({guid = cardObject.guid})
          cardPull.setPositionSmooth({14.50, 3.5, 17.80})
        end
      end
    end
  end

  for _, expansionObject in ipairs(getObjectFromGUID(expansionIX).getObjects()) do
    if expansionObject.guid == expansionLeaders[1] then
        expansionComponent = getObjectFromGUID(expansionIX).takeObject({guid = expansionObject.guid})
        expansionComponent.setPositionSmooth(expansionLeaderPosition[1])
        Wait.frames(function()
          getObjectFromGUID(expansionLeaders[1]).call("claimLabel", {})
        end,120)
    elseif expansionObject.guid == expansionLeaders[2] then
        expansionComponent = getObjectFromGUID(expansionIX).takeObject({guid = expansionObject.guid})
        expansionComponent.setPositionSmooth(expansionLeaderPosition[2])
        Wait.frames(function()
          getObjectFromGUID(expansionLeaders[2]).call("claimLabel", {})
        end,120)
    elseif expansionObject.guid == expansionLeaders[3] then
        expansionComponent = getObjectFromGUID(expansionIX).takeObject({guid = expansionObject.guid})
        expansionComponent.setPositionSmooth(expansionLeaderPosition[3])
        Wait.frames(function()
          getObjectFromGUID(expansionLeaders[3]).call("claimLabel", {})
        end,120)
    elseif expansionObject.guid == expansionLeaders[4] then
        expansionComponent = getObjectFromGUID(expansionIX).takeObject({guid = expansionObject.guid})
        expansionComponent.setPositionSmooth(expansionLeaderPosition[4])
        Wait.frames(function()
          getObjectFromGUID(expansionLeaders[4]).call("claimLabel", {})
        end,120)
    elseif expansionObject.guid == expansionLeaders[5] then
        expansionComponent = getObjectFromGUID(expansionIX).takeObject({guid = expansionObject.guid})
        expansionComponent.setPositionSmooth(expansionLeaderPosition[5])
        Wait.frames(function()
          getObjectFromGUID(expansionLeaders[5]).call("claimLabel", {})
        end,120)
    elseif expansionObject.guid == expansionLeaders[6] then
        expansionComponent = getObjectFromGUID(expansionIX).takeObject({guid = expansionObject.guid})
        expansionComponent.setPositionSmooth(expansionLeaderPosition[6])
        Wait.frames(function()
          getObjectFromGUID(expansionLeaders[6]).call("claimLabel", {})
        end,120)
    elseif expansionObject.guid == deckExpansions[1] then
        expansionComponent = getObjectFromGUID(expansionIX).takeObject({guid = expansionObject.guid})
        expansionComponent.setRotationSmooth({0.00, 180.00, 180.00})
        expansionComponent.setPositionSmooth(deckExpansionPosition[1])
        Wait.frames(function()
          deckObject = GetDeckOrCard(deckZones[1])
          deckObject.shuffle()
        end,120)
    elseif expansionObject.guid == deckExpansions[2] then
        expansionComponent = getObjectFromGUID(expansionIX).takeObject({guid = expansionObject.guid})
        expansionComponent.setRotationSmooth({0.00, 180.00, 180.00})
        expansionComponent.setPositionSmooth(deckExpansionPosition[2])
        Wait.frames(function()
          deckObject = GetDeckOrCard(deckZones[2])
          deckObject.shuffle()
        end,120)
    elseif expansionObject.guid == deckExpansions[3] then
        expansionComponent = getObjectFromGUID(expansionIX).takeObject({guid = expansionObject.guid})
        expansionComponent.setRotationSmooth({0.00, 180.00, 180.00})
        expansionComponent.setPositionSmooth(deckExpansionPosition[3])
        Wait.frames(function()
          deckObject = GetDeckOrCard(deckZones[3])
          deckObject.shuffle()
        end,120)
    elseif expansionObject.guid == deckExpansions[4] then
        expansionComponent = getObjectFromGUID(expansionIX).takeObject({guid = expansionObject.guid})
        expansionComponent.setRotationSmooth({0.00, 180.00, 180.00})
        expansionComponent.setPositionSmooth(deckExpansionPosition[4])
        Wait.frames(function()
          deckObject = GetDeckOrCard(deckZones[4])
          deckObject.shuffle()
        end,120)
    elseif expansionObject.guid == deckExpansions[5] then
        expansionComponent = getObjectFromGUID(expansionIX).takeObject({guid = expansionObject.guid})
        expansionComponent.setRotationSmooth({0.00, 180.00, 180.00})
        expansionComponent.setPositionSmooth(deckExpansionPosition[5])
        Wait.frames(function()
          deckObject = GetDeckOrCard(deckZones[5])
          deckObject.shuffle()
        end,120)
    elseif expansionObject.guid == snooperTokens[1] then
      Wait.frames(function()
        expansionComponentS1 = getObjectFromGUID(expansionIX).takeObject({guid = expansionObject.guid})
        expansionComponentS1.setPositionSmooth(snooperPosition)
        snooperPosition[2] = snooperPosition[2] + 0.5
      end,45)
    elseif expansionObject.guid == snooperTokens[2] then
      Wait.frames(function()
        expansionComponentS2 = getObjectFromGUID(expansionIX).takeObject({guid = expansionObject.guid})
        expansionComponentS2.setPositionSmooth(snooperPosition)
        snooperPosition[2] = snooperPosition[2] + 0.5
      end,45)
    elseif expansionObject.guid == snooperTokens[3] then
      Wait.frames(function()
        expansionComponentS3 = getObjectFromGUID(expansionIX).takeObject({guid = expansionObject.guid})
        expansionComponentS3.setPositionSmooth(snooperPosition)
        snooperPosition[2] = snooperPosition[2] + 0.5
      end,45)
    elseif expansionObject.guid == snooperTokens[4] then
      Wait.frames(function()
        expansionComponentS3 = getObjectFromGUID(expansionIX).takeObject({guid = expansionObject.guid})
        expansionComponentS3.setPositionSmooth(snooperPosition)
        snooperPosition[2] = snooperPosition[2] + 0.5
      end,45)
    elseif expansionObject.guid == boardExpansions[1] then
        expansionComponentA = getObjectFromGUID(expansionIX).takeObject({guid = expansionObject.guid})
        expansionComponentA.setPositionSmooth(boardExpansionPosition[1])
        Wait.frames(function()
          expansionComponentA.lock()
        end,120)
    elseif expansionObject.guid == boardExpansions[2] then
        expansionComponentB = getObjectFromGUID(expansionIX).takeObject({guid = expansionObject.guid})
        expansionComponentB.setPositionSmooth(boardExpansionPosition[2])
        Wait.frames(function()
          expansionComponentB.lock()
        end,120)
    elseif expansionObject.guid == boardExpansions[3] then
        expansionComponentC = getObjectFromGUID(expansionIX).takeObject({guid = expansionObject.guid})
        expansionComponentC.setPositionSmooth(boardExpansionPosition[3])
        Wait.frames(function()
          expansionComponentC.lock()
        end,120)
    elseif expansionObject.guid == dreadnoughtTokens["Red"][1] then
        expansionComponent = getObjectFromGUID(expansionIX).takeObject({guid = expansionObject.guid})
        expansionComponent.setPositionSmooth(dreadnoughtPosition["Red"][1])
        expansionComponent.setRotationSmooth({0.00, 180.00, 0.00})
    elseif expansionObject.guid == dreadnoughtTokens["Red"][2] then
        expansionComponent = getObjectFromGUID(expansionIX).takeObject({guid = expansionObject.guid})
        expansionComponent.setPositionSmooth(dreadnoughtPosition["Red"][2])
        expansionComponent.setRotationSmooth({0.00, 180.00, 0.00})
    elseif expansionObject.guid == dreadnoughtTokens["Blue"][1] then
        expansionComponent = getObjectFromGUID(expansionIX).takeObject({guid = expansionObject.guid})
        expansionComponent.setPositionSmooth(dreadnoughtPosition["Blue"][1])
        expansionComponent.setRotationSmooth({0.00, 180.00, 0.00})
    elseif expansionObject.guid == dreadnoughtTokens["Blue"][2] then
        expansionComponent = getObjectFromGUID(expansionIX).takeObject({guid = expansionObject.guid})
        expansionComponent.setPositionSmooth(dreadnoughtPosition["Blue"][2])
        expansionComponent.setRotationSmooth({0.00, 180.00, 0.00})
    elseif expansionObject.guid == dreadnoughtTokens["Orange"][1] then
        expansionComponent = getObjectFromGUID(expansionIX).takeObject({guid = expansionObject.guid})
        expansionComponent.setPositionSmooth(dreadnoughtPosition["Orange"][1])
        expansionComponent.setRotationSmooth({0.00, 180.00, 0.00})
    elseif expansionObject.guid == dreadnoughtTokens["Orange"][2] then
        expansionComponent = getObjectFromGUID(expansionIX).takeObject({guid = expansionObject.guid})
        expansionComponent.setPositionSmooth(dreadnoughtPosition["Orange"][2])
        expansionComponent.setRotationSmooth({0.00, 180.00, 0.00})
    elseif expansionObject.guid == dreadnoughtTokens["Green"][1] then
        expansionComponent = getObjectFromGUID(expansionIX).takeObject({guid = expansionObject.guid})
        expansionComponent.setPositionSmooth(dreadnoughtPosition["Green"][1])
        expansionComponent.setRotationSmooth({0.00, 180.00, 0.00})
    elseif expansionObject.guid == dreadnoughtTokens["Green"][2] then
        expansionComponent = getObjectFromGUID(expansionIX).takeObject({guid = expansionObject.guid})
        expansionComponent.setPositionSmooth(dreadnoughtPosition["Green"][2])
        expansionComponent.setRotationSmooth({0.00, 180.00, 0.00})
    elseif expansionObject.guid == freighterTokens[1] then
        expansionComponent = getObjectFromGUID(expansionIX).takeObject({guid = expansionObject.guid})
        expansionComponent.setPositionSmooth(freighterPosition[1])
    elseif expansionObject.guid == freighterTokens[2] then
        expansionComponent = getObjectFromGUID(expansionIX).takeObject({guid = expansionObject.guid})
        expansionComponent.setPositionSmooth(freighterPosition[2])
    elseif expansionObject.guid == freighterTokens[3] then
        expansionComponent = getObjectFromGUID(expansionIX).takeObject({guid = expansionObject.guid})
        expansionComponent.setPositionSmooth(freighterPosition[3])
    elseif expansionObject.guid == freighterTokens[4] then
        expansionComponent = getObjectFromGUID(expansionIX).takeObject({guid = expansionObject.guid})
        expansionComponent.setPositionSmooth(freighterPosition[4])
    end
  end

  Wait.frames(function()
  for _, expansionObject in ipairs(getObjectFromGUID(expansionIX).getObjects()) do
    if expansionObject.guid == locationImages[1] then
      expansionComponentD = getObjectFromGUID(expansionIX).takeObject({guid = expansionObject.guid})
      expansionComponentD.setPositionSmooth(locationPosition[1])
      Wait.frames(function()
        expansionComponentD.lock()
      end,120)
    elseif expansionObject.guid == locationImages[2] then
      expansionComponentE = getObjectFromGUID(expansionIX).takeObject({guid = expansionObject.guid})
      expansionComponentE.setPositionSmooth(locationPosition[2])
      Wait.frames(function()
        expansionComponentE.lock()
      end,120)
    elseif expansionObject.guid == locationImages[3] then
      expansionComponentF = getObjectFromGUID(expansionIX).takeObject({guid = expansionObject.guid})
      expansionComponentF.setPositionSmooth(locationPosition[3])
      Wait.frames(function()
        expansionComponentF.lock()
      end,120)
    elseif expansionObject.guid == locationImages[4] then
      expansionComponentG = getObjectFromGUID(expansionIX).takeObject({guid = expansionObject.guid})
      expansionComponentG.setPositionSmooth(locationPosition[4])
      Wait.frames(function()
        expansionComponentG.lock()
      end,120)
    elseif expansionObject.guid == locationImages[5] then
      expansionComponentH = getObjectFromGUID(expansionIX).takeObject({guid = expansionObject.guid})
      expansionComponentH.setPositionSmooth(locationPosition[5])
      Wait.frames(function()
        expansionComponentH.lock()
      end,120)
    elseif expansionObject.guid == locationImages[6] then
      expansionComponentI = getObjectFromGUID(expansionIX).takeObject({guid = expansionObject.guid})
      expansionComponentI.setPositionSmooth(locationPosition[6])
      Wait.frames(function()
        expansionComponentI.lock()
      end,120)
    elseif expansionObject.guid == locationImages[7] then
      expansionComponentJ = getObjectFromGUID(expansionIX).takeObject({guid = expansionObject.guid})
      expansionComponentJ.setPositionSmooth(locationPosition[7])
      Wait.frames(function()
        expansionComponentJ.lock()
      end,120)
    elseif expansionObject.guid == locationImages[8] then
      expansionComponentK = getObjectFromGUID(expansionIX).takeObject({guid = expansionObject.guid})
      expansionComponentK.setPositionSmooth(locationPosition[8])
      Wait.frames(function()
        expansionComponentK.lock()
      end,120)
    elseif expansionObject.guid == rivalHagal[1] then
      expansionComponentL = getObjectFromGUID(expansionIX).takeObject({guid = expansionObject.guid})
      expansionComponentL.setPositionSmooth(tempHagalPos[1])
    elseif expansionObject.guid == rivalHagal[2] then
      expansionComponentM = getObjectFromGUID(expansionIX).takeObject({guid = expansionObject.guid})
      expansionComponentM.setPositionSmooth(tempHagalPos[2])
    elseif expansionObject.guid == rivalHagal[3] then
      expansionComponentN = getObjectFromGUID(expansionIX).takeObject({guid = expansionObject.guid})
      expansionComponentN.setPositionSmooth(tempHagalPos[3])
    end

    --Hagal Repack
    hagalBagPos = getObjectFromGUID(imperiumHagalBag).getPosition()
    hagalBagPos.y = 2.5
    Wait.frames(function()
      getObjectFromGUID(imperiumHagalDecks[1]).setPositionSmooth(hagalBagPos)
    end,120)
    Wait.frames(function()
      getObjectFromGUID(imperiumHagalDecks[2]).setPositionSmooth(hagalBagPos)
    end,180)
    Wait.frames(function()
      getObjectFromGUID(imperiumHagalDecks[3]).setPositionSmooth(hagalBagPos)
    end,240)
  end

  tileBag = getObjectFromGUID(techTiles)
  tileBag.shuffle()
  tileBag.shuffle()

  --Tech Stack 1
  for i=1,6 do
    tileGrab = tileBag.takeObject({rotation = {0.00, 180.00, 180.00}})
    if i == 6 and getObjectFromGUID("dee0f6").getVar("techDisplay") == 1 then
      tileGrab.setRotationSmooth({0.0, 180.00, 0.00})
    end
    tileGrab.setPositionSmooth(techTilePosition[1])
    techTilePosition[1][2] = techTilePosition[1][2] + 0.5
  end

  tileBag.shuffle()

  --Tech Stack 2
  for j=1,6 do
    tileGrab = tileBag.takeObject({rotation = {0.00, 180.00, 180.00}})
    if j == 6 and getObjectFromGUID("dee0f6").getVar("techDisplay") == 1 then
      tileGrab.setRotationSmooth({0.0, 180.00, 0.00})
    end
    tileGrab.setPositionSmooth(techTilePosition[2])
    techTilePosition[2][2] = techTilePosition[2][2] + 0.5
  end

  tileBag.shuffle()

  --Tech Stack 3
  for k=1,6 do
    tileGrab = tileBag.takeObject({rotation = {0.00, 180.00, 180.00}})
    if k == 6 and getObjectFromGUID("dee0f6").getVar("techDisplay") == 1 then
      tileGrab.setRotationSmooth({0.0, 180.00, 0.00})
    end
    tileGrab.setPositionSmooth(techTilePosition[3])
    techTilePosition[3][2] = techTilePosition[3][2] + 0.5
  end
  end,90)

  --Lock Negotiator Location


  --Zone Clearing
  for m=1,8 do
    destroyObject(getObjectFromGUID(zoneClearing[m]))
  end

  --Realign location zones
  getObjectFromGUID("913070").setPosition({-3.37, 3.63, 13.72})
  getObjectFromGUID("12120b").setPosition({0.00, 3.63, 13.72})
  getObjectFromGUID("6e0a33").setPosition({-3.37, 3.63, 11.28})
  getObjectFromGUID("84b048").setPosition({1.24, 3.63, 11.28})
  getObjectFromGUID("7b1013").setPosition({5.59, 3.63, 13.52})
  getObjectFromGUID("9c5484").setPosition({5.58, 3.63, 11.29})
  getObjectFromGUID("64f5b6").setPosition({14.84, 3.63, 13.68})
  getObjectFromGUID("cfb1c9").setPosition({14.83, 3.63, 11.15})

  Wait.frames(function()
    getObjectFromGUID(firstPlayerToken).call("expansionIxAdded", {})
  end,390)

  getObjectFromGUID(firstPlayerToken).call("expansionIX", {})
  self.destruct()

  getObjectFromGUID(firstPlayerToken).call("displayEpic", {})
 else
  broadcastToAll("Wait for the Immortality Expansion Process to Complete")
 end 
end

function GetDeckOrCard(zoneGUID)
  for _, obj in ipairs(getObjectFromGUID(zoneGUID).getObjects()) do
    if obj.name == "Card" or obj.name == "CardCustom" or obj.name == "Deck" or obj.name == "DeckCustom" then
      return obj
    end
  end

 return nil
end

-- ===== Custom_Tile 10f379 (2693 chars) =====
playerBoard = {"bd39f6", "9b4f33", "bd5bf6", "231215"}
councilorTokens = {"f19a48", "f5b14a", "5dd080", "a0028d"}

locationZone = "913070"

function onLoad()
  self.clearButtons()
  self.createButton ({
    ['click_function'] = 'placeAgent',
    ['label'] = 'Send Agent',
    ['function_owner'] = self,
    ['position'] = {0, 0.1, 0.0},
    ['rotation'] =  {0, 0, 0},
    ['scale'] = {1.0,1.0,1.0},
    ['width'] = 3600,
    ['height'] = 800,
    ['font_size'] = 550,
    ['color'] = {0,0,0},
    ['font_color'] = "White"
  })
end

function placeAgent(GO, color)
  local playerZone = 0
  local playerItems = {}
  local agentPos = getObjectFromGUID(locationZone).getPosition()

  agentPos.y = agentPos.y + 0.5

  if color == "Red" then
    playerZone = 1
  elseif color == "Blue" then
    playerZone = 2
  elseif color == "Orange" then
    playerZone = 3
  elseif color == "Green" then
    playerZone = 4
  end

  local agentPresence = 0
  local locationItems = getObjectFromGUID(locationZone).getObjects()

  for _, obj in ipairs(locationItems) do
    if obj.getDescription() == "Agent" then
      agentPresence = 1
    end
  end

  playerItems = getObjectFromGUID(playerBoard[playerZone]).getObjects()
  bonusTokens = getObjectFromGUID("12120b").getObjects()

  local bonusToken = ""
  for _, bonusItem in ipairs(bonusTokens) do
    if bonusItem.getName() == "Councilor Bonus" then
      bonusToken = bonusItem
      break
    end
  end

  local agentCheck = 0
  local placementCheck = getObjectFromGUID(councilorTokens[playerZone]).getPosition()

  local voiceCheck = 0
  local voiceQuery = getObjectFromGUID("913070").getObjects()
    for _, itemQ in ipairs(voiceQuery) do
      if itemQ.getName() == "Voice Token" then
        voiceCheck = 1
      end
    end
  if voiceCheck == 0 then

  if agentPresence == 0 then
   for _, item in ipairs(playerItems) do
    if item.getDescription() == "Agent" then
      item.setPositionSmooth(agentPos, false,true)
      if bonusToken != "" and round(placementCheck.z,2) != 14.08 then
        local bonusPos = bonusToken.getPosition()
        bonusPos.y = 1.5
        getObjectFromGUID(councilorTokens[playerZone]).setPositionSmooth(bonusPos, false, true)
      end
      agentCheck = 1
      break
    end
   end
  elseif agentPresence == 1 then
    broadcastToAll("Agent Already Present at this Location")
  end

  else
    broadcastToAll("Blocked by The Voice!")
  end

  if voiceCheck == 0 and agentCheck == 0 and agentPresence == 0 then
    broadcastToAll(color .. " Player has no Agents Available to Send", stringColorToRGB(color))
  end
end

function round(num, dec)
  local mult = 10^(dec or 0)
  return math.floor(num * mult + 0.5) / mult
end

-- ===== Custom_Tile 7ede9b (1645 chars) =====
playerBoard = {"bd39f6", "9b4f33", "bd5bf6", "231215"}
locationZone = "6e0a33"

function onLoad()
  self.clearButtons()
  self.createButton ({
    ['click_function'] = 'placeAgent',
    ['label'] = 'Send Agent',
    ['function_owner'] = self,
    ['position'] = {0, 0.1, 0.0},
    ['rotation'] =  {0, 0, 0},
    ['scale'] = {1.0,1.0,1.0},
    ['width'] = 3600,
    ['height'] = 800,
    ['font_size'] = 550,
    ['color'] = {0,0,0},
    ['font_color'] = "White"
  })
end

function placeAgent(GO, color)
  local playerZone = 0
  local playerItems = {}
  local agentPos = getObjectFromGUID(locationZone).getPosition()

  agentPos.y = agentPos.y + 0.5

  if color == "Red" then
    playerZone = 1
  elseif color == "Blue" then
    playerZone = 2
  elseif color == "Orange" then
    playerZone = 3
  elseif color == "Green" then
    playerZone = 4
  end

  local agentPresence = 0
  local locationItems = getObjectFromGUID(locationZone).getObjects()

  for _, obj in ipairs(locationItems) do
    if obj.getDescription() == "Agent" then
      agentPresence = 1
    end
  end

  playerItems = getObjectFromGUID(playerBoard[playerZone]).getObjects()

  local agentCheck = 0

  if agentPresence == 0 then
   for _, item in ipairs(playerItems) do
    if item.getDescription() == "Agent" then
      item.setPositionSmooth(agentPos, false,true)
      agentCheck = 1
      break
    end
   end
  elseif agentPresence == 1 then
    broadcastToAll("Agent Already Present at this Location")
  end

  if agentCheck == 0 and agentPresence == 0 then
    broadcastToAll(color .. " Player has no Agents Available to Send", stringColorToRGB(color))
  end

end

-- ===== Custom_Tile 66196a (1645 chars) =====
playerBoard = {"bd39f6", "9b4f33", "bd5bf6", "231215"}
locationZone = "84b048"

function onLoad()
  self.clearButtons()
  self.createButton ({
    ['click_function'] = 'placeAgent',
    ['label'] = 'Send Agent',
    ['function_owner'] = self,
    ['position'] = {0, 0.1, 0.0},
    ['rotation'] =  {0, 0, 0},
    ['scale'] = {1.0,1.0,1.0},
    ['width'] = 3600,
    ['height'] = 800,
    ['font_size'] = 550,
    ['color'] = {0,0,0},
    ['font_color'] = "White"
  })
end

function placeAgent(GO, color)
  local playerZone = 0
  local playerItems = {}
  local agentPos = getObjectFromGUID(locationZone).getPosition()

  agentPos.y = agentPos.y + 0.5

  if color == "Red" then
    playerZone = 1
  elseif color == "Blue" then
    playerZone = 2
  elseif color == "Orange" then
    playerZone = 3
  elseif color == "Green" then
    playerZone = 4
  end

  local agentPresence = 0
  local locationItems = getObjectFromGUID(locationZone).getObjects()

  for _, obj in ipairs(locationItems) do
    if obj.getDescription() == "Agent" then
      agentPresence = 1
    end
  end

  playerItems = getObjectFromGUID(playerBoard[playerZone]).getObjects()

  local agentCheck = 0

  if agentPresence == 0 then
   for _, item in ipairs(playerItems) do
    if item.getDescription() == "Agent" then
      item.setPositionSmooth(agentPos, false,true)
      agentCheck = 1
      break
    end
   end
  elseif agentPresence == 1 then
    broadcastToAll("Agent Already Present at this Location")
  end

  if agentCheck == 0 and agentPresence == 0 then
    broadcastToAll(color .. " Player has no Agents Available to Send", stringColorToRGB(color))
  end

end

-- ===== Custom_Tile 219ead (1645 chars) =====
playerBoard = {"bd39f6", "9b4f33", "bd5bf6", "231215"}
locationZone = "7b1013"

function onLoad()
  self.clearButtons()
  self.createButton ({
    ['click_function'] = 'placeAgent',
    ['label'] = 'Send Agent',
    ['function_owner'] = self,
    ['position'] = {0, 0.1, 0.0},
    ['rotation'] =  {0, 0, 0},
    ['scale'] = {1.0,1.0,1.0},
    ['width'] = 3600,
    ['height'] = 800,
    ['font_size'] = 550,
    ['color'] = {0,0,0},
    ['font_color'] = "White"
  })
end

function placeAgent(GO, color)
  local playerZone = 0
  local playerItems = {}
  local agentPos = getObjectFromGUID(locationZone).getPosition()

  agentPos.y = agentPos.y + 0.5

  if color == "Red" then
    playerZone = 1
  elseif color == "Blue" then
    playerZone = 2
  elseif color == "Orange" then
    playerZone = 3
  elseif color == "Green" then
    playerZone = 4
  end

  local agentPresence = 0
  local locationItems = getObjectFromGUID(locationZone).getObjects()

  for _, obj in ipairs(locationItems) do
    if obj.getDescription() == "Agent" then
      agentPresence = 1
    end
  end

  playerItems = getObjectFromGUID(playerBoard[playerZone]).getObjects()

  local agentCheck = 0

  if agentPresence == 0 then
   for _, item in ipairs(playerItems) do
    if item.getDescription() == "Agent" then
      item.setPositionSmooth(agentPos, false,true)
      agentCheck = 1
      break
    end
   end
  elseif agentPresence == 1 then
    broadcastToAll("Agent Already Present at this Location")
  end

  if agentCheck == 0 and agentPresence == 0 then
    broadcastToAll(color .. " Player has no Agents Available to Send", stringColorToRGB(color))
  end

end

-- ===== Custom_Tile 365c78 (1645 chars) =====
playerBoard = {"bd39f6", "9b4f33", "bd5bf6", "231215"}
locationZone = "9c5484"

function onLoad()
  self.clearButtons()
  self.createButton ({
    ['click_function'] = 'placeAgent',
    ['label'] = 'Send Agent',
    ['function_owner'] = self,
    ['position'] = {0, 0.1, 0.0},
    ['rotation'] =  {0, 0, 0},
    ['scale'] = {1.0,1.0,1.0},
    ['width'] = 3600,
    ['height'] = 800,
    ['font_size'] = 550,
    ['color'] = {0,0,0},
    ['font_color'] = "White"
  })
end

function placeAgent(GO, color)
  local playerZone = 0
  local playerItems = {}
  local agentPos = getObjectFromGUID(locationZone).getPosition()

  agentPos.y = agentPos.y + 0.5

  if color == "Red" then
    playerZone = 1
  elseif color == "Blue" then
    playerZone = 2
  elseif color == "Orange" then
    playerZone = 3
  elseif color == "Green" then
    playerZone = 4
  end

  local agentPresence = 0
  local locationItems = getObjectFromGUID(locationZone).getObjects()

  for _, obj in ipairs(locationItems) do
    if obj.getDescription() == "Agent" then
      agentPresence = 1
    end
  end

  playerItems = getObjectFromGUID(playerBoard[playerZone]).getObjects()

  local agentCheck = 0

  if agentPresence == 0 then
   for _, item in ipairs(playerItems) do
    if item.getDescription() == "Agent" then
      item.setPositionSmooth(agentPos, false,true)
      agentCheck = 1
      break
    end
   end
  elseif agentPresence == 1 then
    broadcastToAll("Agent Already Present at this Location")
  end

  if agentCheck == 0 and agentPresence == 0 then
    broadcastToAll(color .. " Player has no Agents Available to Send", stringColorToRGB(color))
  end

end

-- ===== Custom_Tile ab9708 (1645 chars) =====
playerBoard = {"bd39f6", "9b4f33", "bd5bf6", "231215"}
locationZone = "64f5b6"

function onLoad()
  self.clearButtons()
  self.createButton ({
    ['click_function'] = 'placeAgent',
    ['label'] = 'Send Agent',
    ['function_owner'] = self,
    ['position'] = {0, 0.1, 0.0},
    ['rotation'] =  {0, 0, 0},
    ['scale'] = {1.0,1.0,1.0},
    ['width'] = 3600,
    ['height'] = 800,
    ['font_size'] = 550,
    ['color'] = {0,0,0},
    ['font_color'] = "White"
  })
end

function placeAgent(GO, color)
  local playerZone = 0
  local playerItems = {}
  local agentPos = getObjectFromGUID(locationZone).getPosition()

  agentPos.y = agentPos.y + 0.5

  if color == "Red" then
    playerZone = 1
  elseif color == "Blue" then
    playerZone = 2
  elseif color == "Orange" then
    playerZone = 3
  elseif color == "Green" then
    playerZone = 4
  end

  local agentPresence = 0
  local locationItems = getObjectFromGUID(locationZone).getObjects()

  for _, obj in ipairs(locationItems) do
    if obj.getDescription() == "Agent" then
      agentPresence = 1
    end
  end

  playerItems = getObjectFromGUID(playerBoard[playerZone]).getObjects()

  local agentCheck = 0

  if agentPresence == 0 then
   for _, item in ipairs(playerItems) do
    if item.getDescription() == "Agent" then
      item.setPositionSmooth(agentPos, false,true)
      agentCheck = 1
      break
    end
   end
  elseif agentPresence == 1 then
    broadcastToAll("Agent Already Present at this Location")
  end

  if agentCheck == 0 and agentPresence == 0 then
    broadcastToAll(color .. " Player has no Agents Available to Send", stringColorToRGB(color))
  end

end

-- ===== Custom_Tile 051382 (1645 chars) =====
playerBoard = {"bd39f6", "9b4f33", "bd5bf6", "231215"}
locationZone = "cfb1c9"

function onLoad()
  self.clearButtons()
  self.createButton ({
    ['click_function'] = 'placeAgent',
    ['label'] = 'Send Agent',
    ['function_owner'] = self,
    ['position'] = {0, 0.1, 0.0},
    ['rotation'] =  {0, 0, 0},
    ['scale'] = {1.0,1.0,1.0},
    ['width'] = 3600,
    ['height'] = 800,
    ['font_size'] = 550,
    ['color'] = {0,0,0},
    ['font_color'] = "White"
  })
end

function placeAgent(GO, color)
  local playerZone = 0
  local playerItems = {}
  local agentPos = getObjectFromGUID(locationZone).getPosition()

  agentPos.y = agentPos.y + 0.5

  if color == "Red" then
    playerZone = 1
  elseif color == "Blue" then
    playerZone = 2
  elseif color == "Orange" then
    playerZone = 3
  elseif color == "Green" then
    playerZone = 4
  end

  local agentPresence = 0
  local locationItems = getObjectFromGUID(locationZone).getObjects()

  for _, obj in ipairs(locationItems) do
    if obj.getDescription() == "Agent" then
      agentPresence = 1
    end
  end

  playerItems = getObjectFromGUID(playerBoard[playerZone]).getObjects()

  local agentCheck = 0

  if agentPresence == 0 then
   for _, item in ipairs(playerItems) do
    if item.getDescription() == "Agent" then
      item.setPositionSmooth(agentPos, false,true)
      agentCheck = 1
      break
    end
   end
  elseif agentPresence == 1 then
    broadcastToAll("Agent Already Present at this Location")
  end

  if agentCheck == 0 and agentPresence == 0 then
    broadcastToAll(color .. " Player has no Agents Available to Send", stringColorToRGB(color))
  end

end

-- ===== CardCustom a2ace8 (7713 chars) =====
--Counting Bowl    by MrStump
timerID = ""

validCountItemListRed = {
    ["Red"] = 2,
    ["Red Dreadnought"] = 3,
}

validCountItemListBlue = {
    ["Blue"] = 2,
    ["Blue Dreadnought"] = 3,
}

validCountItemListOrange = {
    ["Orange"] = 2,
    ["Orange Dreadnought"] = 3,
}

validCountItemListGreen = {
    ["Green"] = 2,
    ["Green Dreadnought"] = 3,
}

function onLoad()
    timerIDRed = self.getGUID()..math.random(9999999999999)
    timerIDBlue = self.getGUID()..math.random(9999999999999)
    timerIDOrange = self.getGUID()..math.random(9999999999999)
    timerIDGreen = self.getGUID()..math.random(9999999999999)

    --Red
    self.createButton({
        label="", click_function="none", function_owner=self,
        position={-0.6,-0.2,-1.45}, rotation={0,0,0}, height=00, width=0,
        --position={0.6,0.2,-1.45}, rotation={0,0,0}, height=00, width=0,
        font_color={1,1,1}, scale = {0.3,0.3,0.3}, font_size=125
    })

    --Blue
    self.createButton({
        label="", click_function="none", function_owner=self,
        position={-0.6,-0.2,1.45}, rotation={0,0,0}, height=00, width=0,
        font_color={1,1,1}, scale = {0.3,0.3,0.3}, font_size=125
    })

    --Orange
    self.createButton({
        label="", click_function="none", function_owner=self,
        position={0.6,-0.2,1.45}, rotation={0,0,0}, height=00, width=0,
        font_color={1,1,1}, scale = {0.3,0.3,0.3}, font_size=125
    })

    --Green
    self.createButton({
        label="", click_function="none", function_owner=self,
        position={0.6,-0.2,-1.45}, rotation={0,0,0}, height=00, width=0,
        font_color={1,1,1}, scale = {0.3,0.3,0.3}, font_size=125
    })

    Timer.create({
        identifier=timerIDRed,
        function_name="countItemsRed", function_owner=self,
        repetitions=0, delay=0.75
    })

    Timer.create({
        identifier=timerIDBlue,
        function_name="countItemsBlue", function_owner=self,
        repetitions=0, delay=0.75
    })

    Timer.create({
        identifier=timerIDOrange,
        function_name="countItemsOrange", function_owner=self,
        repetitions=0, delay=0.75
    })

    Timer.create({
        identifier=timerIDGreen,
        function_name="countItemsGreen", function_owner=self,
        repetitions=0, delay=0.75
    })
end

function raiseLabels()
  self.editButton({index=0, position={-0.7,0.2,-1.6}})
  self.editButton({index=1, position={-0.7,0.2,1.6}})
  self.editButton({index=2, position={0.7,0.2,1.6}})
  self.editButton({index=3, position={0.7,0.2,-1.6}})
end

--Activated once per second, counts items in bowls
function countItemsRed()
    local totalValue = 0
    local itemsInBowl = findItemsInSphere()
    --Go through all items found by the cast
    for _, entry in ipairs(itemsInBowl) do
        --Ignore the bowl
        if entry.hit_object ~= self then
            local tableEntry = validCountItemListRed[entry.hit_object.getName()]
            --Ignore if not in validCountItemList
            if tableEntry ~= nil then
                local descValue = tonumber(entry.hit_object.getDescription())
                local stackMult = math.abs(entry.hit_object.getQuantity())
                --Use value in description if available
                if descValue ~= nil then
                    totalValue = totalValue + descValue * stackMult
                else
                    --Otherwise use the value in validCountItemList
                    totalValue = totalValue + tableEntry * stackMult
                end
            end
        end
    end
    --Updates the number display
    totalValue = (totalValue .. " Combat Strength")
    self.editButton({index=0, label=totalValue})
end

function countItemsBlue()
    local totalValue = 0
    local itemsInBowl = findItemsInSphere()
    --Go through all items found by the cast
    for _, entry in ipairs(itemsInBowl) do
        --Ignore the bowl
        if entry.hit_object ~= self then
            local tableEntry = validCountItemListBlue[entry.hit_object.getName()]
            --Ignore if not in validCountItemList
            if tableEntry ~= nil then
                local descValue = tonumber(entry.hit_object.getDescription())
                local stackMult = math.abs(entry.hit_object.getQuantity())
                --Use value in description if available
                if descValue ~= nil then
                    totalValue = totalValue + descValue * stackMult
                else
                    --Otherwise use the value in validCountItemList
                    totalValue = totalValue + tableEntry * stackMult
                end
            end
        end
    end
    --Updates the number display
    totalValue = (totalValue .. " Combat Strength")
    self.editButton({index=1, label=totalValue})
end

function countItemsOrange()
    local totalValue = 0
    local itemsInBowl = findItemsInSphere()
    --Go through all items found by the cast
    for _, entry in ipairs(itemsInBowl) do
        --Ignore the bowl
        if entry.hit_object ~= self then
            local tableEntry = validCountItemListOrange[entry.hit_object.getName()]
            --Ignore if not in validCountItemList
            if tableEntry ~= nil then
                local descValue = tonumber(entry.hit_object.getDescription())
                local stackMult = math.abs(entry.hit_object.getQuantity())
                --Use value in description if available
                if descValue ~= nil then
                    totalValue = totalValue + descValue * stackMult
                else
                    --Otherwise use the value in validCountItemList
                    totalValue = totalValue + tableEntry * stackMult
                end
            end
        end
    end
    --Updates the number display
    totalValue = (totalValue .. " Combat Strength")
    self.editButton({index=2, label=totalValue})
end

function countItemsGreen()
    local totalValue = 0
    local itemsInBowl = findItemsInSphere()
    --Go through all items found by the cast
    for _, entry in ipairs(itemsInBowl) do
        --Ignore the bowl
        if entry.hit_object ~= self then
            local tableEntry = validCountItemListGreen[entry.hit_object.getName()]
            --Ignore if not in validCountItemList
            if tableEntry ~= nil then
                local descValue = tonumber(entry.hit_object.getDescription())
                local stackMult = math.abs(entry.hit_object.getQuantity())
                --Use value in description if available
                if descValue ~= nil then
                    totalValue = totalValue + descValue * stackMult
                else
                    --Otherwise use the value in validCountItemList
                    totalValue = totalValue + tableEntry * stackMult
                end
            end
        end
    end
    --Updates the number display
    totalValue = (totalValue .. " Combat Strength")
    self.editButton({index=3, label=totalValue})
end

--Gets the items in the bowl for countItems to count
function findItemsInSphere()
    --Find scaling factor
    local scale = self.getScale()
    --Set position for the sphere
    local pos = self.getPosition()
    --pos.y=pos.y+(1.25*scale.y)
    --Ray trace to get all objects
    return Physics.cast({
        origin=pos, direction={0,1,0}, type=3, max_distance=0,
        size={2.2*scale.x,2.75*scale.y,2.7*scale.z}, --debug=true
    })
end

function onDestroy()
  --if timerID ~= nil then
    --Timer.destroy(timerID)
  --end
end

-- ===== Custom_PDF 6d50d8 (4415 chars) =====
function onLoad()
  buttonRed = 20
  buttonGreen = 31
  buttonBlue = 27

  buttonRed = buttonRed/255
  buttonGreen = buttonGreen/255
  buttonBlue = buttonBlue/255

  self.clearButtons()
  self.createButton ({
    ['click_function'] = 'setupPage',
    ['label'] = 'Setup',
    ['function_owner'] = self,
    ['position'] = {-2.7, 0.3, -1.0},
    ['rotation'] =  {0, 0, 0},
    ['scale'] = {0.7,1,0.7},
    ['width'] = 900,
    ['height'] = 200,
    ['font_size'] = 100,
    ['color'] = {buttonRed, buttonGreen, buttonBlue},
    ['font_color'] = "White"
  })
  self.createButton ({
    ['click_function'] = 'techPage',
    ['label'] = 'Tech Tiles',
    ['function_owner'] = self,
    ['position'] = {-2.7, 0.3, -0.7},
    ['rotation'] =  {0, 0, 0},
    ['scale'] = {0.7,1,0.7},
    ['width'] = 900,
    ['height'] = 200,
    ['font_size'] = 100,
    ['color'] = {buttonRed, buttonGreen, buttonBlue},
    ['font_color'] = "White"
  })
  self.createButton ({
    ['click_function'] = 'shippingPage',
    ['label'] = 'Shipping',
    ['function_owner'] = self,
    ['position'] = {-2.7, 0.3, -0.4},
    ['rotation'] =  {0, 0, 0},
    ['scale'] = {0.7,1,0.7},
    ['width'] = 900,
    ['height'] = 200,
    ['font_size'] = 100,
    ['color'] = {buttonRed, buttonGreen, buttonBlue},
    ['font_color'] = "White"
  })
  self.createButton ({
    ['click_function'] = 'dreadPage',
    ['label'] = 'Dreadnoughts',
    ['function_owner'] = self,
    ['position'] = {-2.7, 0.3, -0.1},
    ['rotation'] =  {0, 0, 0},
    ['scale'] = {0.7,1,0.7},
    ['width'] = 900,
    ['height'] = 200,
    ['font_size'] = 100,
    ['color'] = {buttonRed, buttonGreen, buttonBlue},
    ['font_color'] = "White"
  })
  self.createButton ({
    ['click_function'] = 'iconsPage',
    ['label'] = 'New Icons',
    ['function_owner'] = self,
    ['position'] = {-2.7, 0.3, 0.2},
    ['rotation'] =  {0, 0, 0},
    ['scale'] = {0.7,1,0.7},
    ['width'] = 900,
    ['height'] = 200,
    ['font_size'] = 100,
    ['color'] = {buttonRed, buttonGreen, buttonBlue},
    ['font_color'] = "White"
  })
  self.createButton ({
    ['click_function'] = 'additionsPage',
    ['label'] = '1P/2P Additions',
    ['function_owner'] = self,
    ['position'] = {-2.7, 0.3, 0.5},
    ['rotation'] =  {0, 0, 0},
    ['scale'] = {0.7,1,0.7},
    ['width'] = 900,
    ['height'] = 200,
    ['font_size'] = 100,
    ['color'] = {buttonRed, buttonGreen, buttonBlue},
    ['font_color'] = "White"
  })
  self.createButton ({
    ['click_function'] = 'variantsPage',
    ['label'] = 'Solo Variants',
    ['function_owner'] = self,
    ['position'] = {-2.7, 0.3, 0.8},
    ['rotation'] =  {0, 0, 0},
    ['scale'] = {0.7,1,0.7},
    ['width'] = 900,
    ['height'] = 200,
    ['font_size'] = 100,
    ['color'] = {buttonRed, buttonGreen, buttonBlue},
    ['font_color'] = "White"
  })
  self.createButton ({
    ['click_function'] = 'epicPage',
    ['label'] = 'Epic Game Mode',
    ['function_owner'] = self,
    ['position'] = {-2.7, 0.3, 1.1},
    ['rotation'] =  {0, 0, 0},
    ['scale'] = {0.7,1,0.7},
    ['width'] = 900,
    ['height'] = 200,
    ['font_size'] = 100,
    ['color'] = {buttonRed, buttonGreen, buttonBlue},
    ['font_color'] = "White"
  })
  self.createButton ({
    ['click_function'] = 'referencePage',
    ['label'] = 'Reference Guide',
    ['function_owner'] = self,
    ['position'] = {-2.7, 0.3, 1.4},
    ['rotation'] =  {0, 0, 0},
    ['scale'] = {0.7,1,0.7},
    ['width'] = 900,
    ['height'] = 200,
    ['font_size'] = 100,
    ['color'] = {buttonRed, buttonGreen, buttonBlue},
    ['font_color'] = "White"
  })
end

function setupPage()
  getObjectFromGUID("6d50d8").book.setPage(2)
end

function techPage()
  getObjectFromGUID("6d50d8").book.setPage(3)
end

function shippingPage()
  getObjectFromGUID("6d50d8").book.setPage(4)
end

function dreadPage()
  getObjectFromGUID("6d50d8").book.setPage(5)
end

function iconsPage()
  getObjectFromGUID("6d50d8").book.setPage(6)
end

function additionsPage()
  getObjectFromGUID("6d50d8").book.setPage(7)
end

function variantsPage()
  getObjectFromGUID("6d50d8").book.setPage(8)
end

function epicPage()
  getObjectFromGUID("6d50d8").book.setPage(9)
end

function referencePage()
  getObjectFromGUID("6d50d8").book.setPage(11)
end

-- ===== CardCustom f6cbd0 (4326 chars) =====
--Counting Bowl    by MrStump
timerID = ""

validCountItemListRed = {
    ["Red"] = 2,
    ["Red Dreadnought"] = 3,
}
validCountItemListBlue = {
    ["Blue"] = 2,
    ["Blue Dreadnought"] = 3,
}


function onLoad()
    timerIDRed = self.getGUID()..math.random(9999999999999)
    timerIDBlue = self.getGUID()..math.random(9999999999999)

    self.createButton({
        label="Garrison Strength: 0", click_function="none", function_owner=self,
        position={0.1,-0.2,-0.20}, rotation={0,0,0}, height=00, width=0,
        --position={0.6,0.2,-1.45}, rotation={0,0,0}, height=00, width=0,
        font_color={1,1,1}, scale = {0.3,0.3,0.3}, font_size=125
    })

    self.createButton({
        label="Garrison Strength: 0", click_function="none", function_owner=self,
        position={0.1,-0.2,0.25}, rotation={0,0,0}, height=00, width=0,
        --position={0.6,0.2,-1.45}, rotation={0,0,0}, height=00, width=0,
        font_color={1,1,1}, scale = {0.3,0.3,0.3}, font_size=125
    })

    Timer.create({
        identifier=timerIDRed,
        function_name="countItemsRed", function_owner=self,
        repetitions=0, delay=0.75
    })
    Timer.create({
        identifier=timerIDBlue,
        function_name="countItemsBlue", function_owner=self,
        repetitions=0, delay=0.75
    })
end

function raiseLabels()
  self.editButton({index=0, position={0.1,0.2,-0.25}})
  self.editButton({index=1, position={0.1,0.2,0.20}})
end

--Activated once per second, counts items in bowls
function countItemsRed()
    local totalValue = 0
    local itemsInBowl = findItemsInSphere()
    --Go through all items found by the cast
    for _, entry in ipairs(itemsInBowl) do
        --Ignore the bowl
        if entry.hit_object ~= self then
            local tableEntry = validCountItemListRed[entry.hit_object.getName()]
            --Ignore if not in validCountItemList
            if tableEntry ~= nil then
                local descValue = tonumber(entry.hit_object.getDescription())
                local stackMult = math.abs(entry.hit_object.getQuantity())
                --Use value in description if available
                if descValue ~= nil then
                    totalValue = totalValue + descValue * stackMult
                else
                    --Otherwise use the value in validCountItemList
                    totalValue = totalValue + tableEntry * stackMult
                end
            end
        end
    end
    --Updates the number display
    totalValue = ("Garrison Strength: " .. totalValue)
    self.editButton({index=0, label=totalValue})
end

function countItemsBlue()
    local totalValue = 0
    local itemsInBowl = findItemsInSphere()
    --Go through all items found by the cast
    for _, entry in ipairs(itemsInBowl) do
        --Ignore the bowl
        if entry.hit_object ~= self then
            local tableEntry = validCountItemListBlue[entry.hit_object.getName()]
            --Ignore if not in validCountItemList
            if tableEntry ~= nil then
                local descValue = tonumber(entry.hit_object.getDescription())
                local stackMult = math.abs(entry.hit_object.getQuantity())
                --Use value in description if available
                if descValue ~= nil then
                    totalValue = totalValue + descValue * stackMult
                else
                    --Otherwise use the value in validCountItemList
                    totalValue = totalValue + tableEntry * stackMult
                end
            end
        end
    end
    --Updates the number display
    totalValue = ("Garrison Strength: " .. totalValue)
    self.editButton({index=1, label=totalValue})
end

--Gets the items in the bowl for countItems to count
function findItemsInSphere()
    --Find scaling factor
    local scale = self.getScale()
    --Set position for the sphere
    local pos = self.getPosition()
    --pos.y=pos.y+(1.25*scale.y)
    --Ray trace to get all objects
    return Physics.cast({
        origin=pos, direction={0,1,0}, type=3, max_distance=0,
        size={1.2*scale.x,2.75*scale.y,2.8*scale.z}, --debug=true
    })
end

function onDestroy()
  --if timerID ~= nil then
    --Timer.destroy(timerID)
  --end
end

-- ===== CardCustom 410349 (4362 chars) =====
--Counting Bowl    by MrStump
timerID = ""

validCountItemListOrange = {
    ["Orange"] = 2,
    ["Orange Dreadnought"] = 3,
}
validCountItemListGreen = {
    ["Green"] = 2,
    ["Green Dreadnought"] = 3,
}


function onLoad()
    timerIDOrange = self.getGUID()..math.random(9999999999999)
    timerIDGreen = self.getGUID()..math.random(9999999999999)

    self.createButton({
        label="Garrison Strength: 0", click_function="none", function_owner=self,
        position={-0.1,-0.2,-0.20}, rotation={0,0,0}, height=00, width=0,
        --position={0.6,0.2,-1.45}, rotation={0,0,0}, height=00, width=0,
        font_color={1,1,1}, scale = {0.3,0.3,0.3}, font_size=125
    })

    self.createButton({
        label="Garrison Strength: 0", click_function="none", function_owner=self,
        position={-0.1,-0.2,0.25}, rotation={0,0,0}, height=00, width=0,
        --position={0.6,0.2,-1.45}, rotation={0,0,0}, height=00, width=0,
        font_color={1,1,1}, scale = {0.3,0.3,0.3}, font_size=125
    })

    Timer.create({
        identifier=timerIDOrange,
        function_name="countItemsOrange", function_owner=self,
        repetitions=0, delay=0.75
    })
    Timer.create({
        identifier=timerIDGreen,
        function_name="countItemsGreen", function_owner=self,
        repetitions=0, delay=0.75
    })
end

function raiseLabels()
  self.editButton({index=0, position={-0.1,0.2,-0.25}})
  self.editButton({index=1, position={-0.1,0.2,0.20}})
end

--Activated once per second, counts items in bowls
function countItemsOrange()
    local totalValue = 0
    local itemsInBowl = findItemsInSphere()
    --Go through all items found by the cast
    for _, entry in ipairs(itemsInBowl) do
        --Ignore the bowl
        if entry.hit_object ~= self then
            local tableEntry = validCountItemListOrange[entry.hit_object.getName()]
            --Ignore if not in validCountItemList
            if tableEntry ~= nil then
                local descValue = tonumber(entry.hit_object.getDescription())
                local stackMult = math.abs(entry.hit_object.getQuantity())
                --Use value in description if available
                if descValue ~= nil then
                    totalValue = totalValue + descValue * stackMult
                else
                    --Otherwise use the value in validCountItemList
                    totalValue = totalValue + tableEntry * stackMult
                end
            end
        end
    end
    --Updates the number display
    totalValue = ("Garrison Strength: " .. totalValue)
    self.editButton({index=1, label=totalValue})
end

function countItemsGreen()
    local totalValue = 0
    local itemsInBowl = findItemsInSphere()
    --Go through all items found by the cast
    for _, entry in ipairs(itemsInBowl) do
        --Ignore the bowl
        if entry.hit_object ~= self then
            local tableEntry = validCountItemListGreen[entry.hit_object.getName()]
            --Ignore if not in validCountItemList
            if tableEntry ~= nil then
                local descValue = tonumber(entry.hit_object.getDescription())
                local stackMult = math.abs(entry.hit_object.getQuantity())
                --Use value in description if available
                if descValue ~= nil then
                    totalValue = totalValue + descValue * stackMult
                else
                    --Otherwise use the value in validCountItemList
                    totalValue = totalValue + tableEntry * stackMult
                end
            end
        end
    end
    --Updates the number display
    totalValue = ("Garrison Strength: " .. totalValue)
    self.editButton({index=0, label=totalValue})
end

--Gets the items in the bowl for countItems to count
function findItemsInSphere()
    --Find scaling factor
    local scale = self.getScale()
    --Set position for the sphere
    local pos = self.getPosition()
    --pos.y=pos.y+(1.25*scale.y)
    --Ray trace to get all objects
    return Physics.cast({
        origin=pos, direction={0,1,0}, type=3, max_distance=0,
        size={1.2*scale.x,2.75*scale.y,2.8*scale.z}, --debug=true
    })
end

function onDestroy()
  --if timerID ~= nil then
    --Timer.destroy(timerID)
  --end
end

-- ===== Family Atomics 6b99a0 (1805 chars) =====
imperiumRow = {"b17148", "a4f598", "2f3821", "52cc32", "85a5fe"}
trashBin = "288283"
imperiumDeckZone = "ad3c5a"

buttonRed = 195
buttonGreen = 64
buttonBlue = 1

buttonRed = buttonRed/255
buttonGreen = buttonGreen/255
buttonBlue = buttonBlue/255

self.createButton({
   click_function = "cardRefresh",
   function_owner = self,
   label          = "Refresh Imperium Row",
   position       = {0.0,0.15,0.10},
   rotation       = {0, 0, 0},
   scale          = {1.2, 1.2, 1.2},
   width          = 1300,
   height         = 200,
   tooltip        = "",
   font_color     = {1, 1, 1},
   font_size      = 125,
   color          = {buttonRed, buttonGreen, buttonBlue},
   })

function cardRefresh()
    startLuaCoroutine(self, "cardRefreshRoutine")

    getObjectFromGUID(trashBin).putObject(self)
end

function cardRefreshRoutine()
    imperiumDeck = GetDeckOrCard(imperiumDeckZone)

    for x=1,5 do
        local cardRef = GetDeckOrCard(imperiumRow[x])
        
        getObjectFromGUID(trashBin).putObject(cardRef)
        
        local Time = os.clock() + 0.25
        while os.clock() < Time do
            coroutine.yield(0)
        end
    end

    for i=1, 5 do
        rowPos = getObjectFromGUID(imperiumRow[i]).getPosition()
        rowPos.y = 2
        imperiumDeck.takeObject({position = rowPos, flip = true})
        
        local Time = os.clock() + 0.25
        while os.clock() < Time do
            coroutine.yield(0)
        end
    end

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

-- ===== Family Atomics 8bdf47 (1805 chars) =====
imperiumRow = {"b17148", "a4f598", "2f3821", "52cc32", "85a5fe"}
trashBin = "288283"
imperiumDeckZone = "ad3c5a"

buttonRed = 195
buttonGreen = 64
buttonBlue = 1

buttonRed = buttonRed/255
buttonGreen = buttonGreen/255
buttonBlue = buttonBlue/255

self.createButton({
   click_function = "cardRefresh",
   function_owner = self,
   label          = "Refresh Imperium Row",
   position       = {0.0,0.15,0.10},
   rotation       = {0, 0, 0},
   scale          = {1.2, 1.2, 1.2},
   width          = 1300,
   height         = 200,
   tooltip        = "",
   font_color     = {1, 1, 1},
   font_size      = 125,
   color          = {buttonRed, buttonGreen, buttonBlue},
   })

function cardRefresh()
    startLuaCoroutine(self, "cardRefreshRoutine")

    getObjectFromGUID(trashBin).putObject(self)
end

function cardRefreshRoutine()
    imperiumDeck = GetDeckOrCard(imperiumDeckZone)

    for x=1,5 do
        local cardRef = GetDeckOrCard(imperiumRow[x])
        
        getObjectFromGUID(trashBin).putObject(cardRef)
        
        local Time = os.clock() + 0.25
        while os.clock() < Time do
            coroutine.yield(0)
        end
    end

    for i=1, 5 do
        rowPos = getObjectFromGUID(imperiumRow[i]).getPosition()
        rowPos.y = 2
        imperiumDeck.takeObject({position = rowPos, flip = true})
        
        local Time = os.clock() + 0.25
        while os.clock() < Time do
            coroutine.yield(0)
        end
    end

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

-- ===== Family Atomics 734e21 (1805 chars) =====
imperiumRow = {"b17148", "a4f598", "2f3821", "52cc32", "85a5fe"}
trashBin = "288283"
imperiumDeckZone = "ad3c5a"

buttonRed = 195
buttonGreen = 64
buttonBlue = 1

buttonRed = buttonRed/255
buttonGreen = buttonGreen/255
buttonBlue = buttonBlue/255

self.createButton({
   click_function = "cardRefresh",
   function_owner = self,
   label          = "Refresh Imperium Row",
   position       = {0.0,0.15,0.10},
   rotation       = {0, 0, 0},
   scale          = {1.2, 1.2, 1.2},
   width          = 1300,
   height         = 200,
   tooltip        = "",
   font_color     = {1, 1, 1},
   font_size      = 125,
   color          = {buttonRed, buttonGreen, buttonBlue},
   })

function cardRefresh()
    startLuaCoroutine(self, "cardRefreshRoutine")

    getObjectFromGUID(trashBin).putObject(self)
end

function cardRefreshRoutine()
    imperiumDeck = GetDeckOrCard(imperiumDeckZone)

    for x=1,5 do
        local cardRef = GetDeckOrCard(imperiumRow[x])
        
        getObjectFromGUID(trashBin).putObject(cardRef)
        
        local Time = os.clock() + 0.25
        while os.clock() < Time do
            coroutine.yield(0)
        end
    end

    for i=1, 5 do
        rowPos = getObjectFromGUID(imperiumRow[i]).getPosition()
        rowPos.y = 2
        imperiumDeck.takeObject({position = rowPos, flip = true})
        
        local Time = os.clock() + 0.25
        while os.clock() < Time do
            coroutine.yield(0)
        end
    end

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

-- ===== Family Atomics 21b506 (1805 chars) =====
imperiumRow = {"b17148", "a4f598", "2f3821", "52cc32", "85a5fe"}
trashBin = "288283"
imperiumDeckZone = "ad3c5a"

buttonRed = 195
buttonGreen = 64
buttonBlue = 1

buttonRed = buttonRed/255
buttonGreen = buttonGreen/255
buttonBlue = buttonBlue/255

self.createButton({
   click_function = "cardRefresh",
   function_owner = self,
   label          = "Refresh Imperium Row",
   position       = {0.0,0.15,0.10},
   rotation       = {0, 0, 0},
   scale          = {1.2, 1.2, 1.2},
   width          = 1300,
   height         = 200,
   tooltip        = "",
   font_color     = {1, 1, 1},
   font_size      = 125,
   color          = {buttonRed, buttonGreen, buttonBlue},
   })

function cardRefresh()
    startLuaCoroutine(self, "cardRefreshRoutine")

    getObjectFromGUID(trashBin).putObject(self)
end

function cardRefreshRoutine()
    imperiumDeck = GetDeckOrCard(imperiumDeckZone)

    for x=1,5 do
        local cardRef = GetDeckOrCard(imperiumRow[x])
        
        getObjectFromGUID(trashBin).putObject(cardRef)
        
        local Time = os.clock() + 0.25
        while os.clock() < Time do
            coroutine.yield(0)
        end
    end

    for i=1, 5 do
        rowPos = getObjectFromGUID(imperiumRow[i]).getPosition()
        rowPos.y = 2
        imperiumDeck.takeObject({position = rowPos, flip = true})
        
        local Time = os.clock() + 0.25
        while os.clock() < Time do
            coroutine.yield(0)
        end
    end

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

-- ===== CardCustom a51a29 (1844 chars) =====
playerBoards = {"a0fa97", "042887", "e435ab", "f8a49f"}
defaultColorList = {"Red", "Blue", "Orange", "Green"}

playerSpot = 0

function onCollisionEnter(info)
  playerSpot = 0
  local mentatColor = ""
  if info.collision_object.getDescription() == "Agent" then
    if info.collision_object.getName() == "Mentat" then
      mentatColor = getObjectFromGUID("e7e9b1").getVar("playerColor")
    end
    if mentatColor == "Red" or info.collision_object.getName() == "Red Agent" or info.collision_object.getName() == "Red Swordmaster" then
      playerSpot = 1
    elseif mentatColor == "Blue" or info.collision_object.getName() == "Blue Agent" or info.collision_object.getName() == "Blue Swordmaster" then
      playerSpot = 2
    elseif mentatColor == "Orange" or info.collision_object.getName() == "Orange Agent" or info.collision_object.getName() == "Orange Swordmaster" then
      playerSpot = 3
    elseif mentatColor == "Green" or info.collision_object.getName() == "Green Agent" or info.collision_object.getName() == "Green Swordmaster" then
      playerSpot = 4
    end
    if playerSpot != 0 and Global.getVar("rivals")[playerSpot] != 1 then
      startLuaCoroutine(self, "boardAction")
      broadcastToAll(defaultColorList[playerSpot] .. " Player May Send Troops to the Conflict Space")
    end
  end
end

function boardAction()
  for i=1, 2 do
    getObjectFromGUID(playerBoards[playerSpot]).call("spendWater",{})

    local Time = os.clock() + 0.5
     while os.clock() < Time do
       coroutine.yield(0)
     end
  end
  for i=1, 2 do
    getObjectFromGUID(playerBoards[playerSpot]).call("drawCard",{})

    local Time = os.clock() + 0.5
     while os.clock() < Time do
       coroutine.yield(0)
     end
  end
  broadcastToAll("Reminder: Advance Token on Research Track")
  return 1
end

-- ===== Scientific Breakthrough a22960 (2221 chars) =====
function onLoad()
    self.clearButtons()
    self.createButton({
     ['click_function'] = 'trashConfirm',
     ['label'] = 'Trash the Card?',
     ['function_owner'] = self,
     ['position'] = {0, 0.2, 0.3},
     ['rotation'] =  {0, 0, 0},
     ['width'] = 800,
     ['height'] = 200,
     ['scale'] = {0.9,0.9,0.9},
     ['font_size'] = 75,
     ['font_color'] = {1, 1, 1}
 ,
     ['color'] = {0,0,0}
    })
 end
 
 function trashConfirm()
    self.clearButtons()
    self.createButton({
     ['click_function'] = 'doNothing',
     ['label'] = 'Are You Sure?',
     ['function_owner'] = self,
     ['position'] = {0, 0.2, 0.3},
     ['rotation'] =  {0, 0, 0},
     ['width'] = 800,
     ['height'] = 200,
     ['scale'] = {0.9,0.9,0.9},
     ['font_size'] = 75,
     ['font_color'] = {1, 1, 1}
 ,
     ['color'] = {0,0,0}
    })
    self.createButton({
     ['click_function'] = 'trashCard',
     ['label'] = 'Yes',
     ['function_owner'] = self,
     ['position'] = {-0.2, 0.2, 0.6},
     ['rotation'] =  {0, 0, 0},
     ['width'] = 150,
     ['height'] = 100,
     ['scale'] = {0.9,0.9,0.9},
     ['font_size'] = 75,
     ['font_color'] = {1, 1, 1}
 ,
     ['color'] = "Green"
    })
    self.createButton({
     ['click_function'] = 'holdCard',
     ['label'] = 'No',
     ['function_owner'] = self,
     ['position'] = {0.2, 0.2, 0.6},
     ['rotation'] =  {0, 0, 0},
     ['width'] = 150,
     ['height'] = 100,
     ['scale'] = {0.9,0.9,0.9},
     ['font_size'] = 75,
     ['font_color'] = {1, 1, 1}
 ,
     ['color'] = "Red"
    })
 end
 
 function holdCard()
    self.clearButtons()
    self.createButton({
     ['click_function'] = 'trashConfirm',
     ['label'] = 'Trash the Card?',
     ['function_owner'] = self,
     ['position'] = {0, 0.2, 0.3},
     ['rotation'] =  {0, 0, 0},
     ['width'] = 800,
     ['height'] = 200,
     ['scale'] = {0.9,0.9,0.9},
     ['font_size'] = 75,
     ['font_color'] = {1, 1, 1}
 ,
     ['color'] = {0,0,0}
    })
 end
 
 function trashCard()
   self.clearButtons()
   getObjectFromGUID("288283").putObject(self)
   broadcastToAll("Card Trashed")
 end
 
 function doNothing()
 end

-- ===== Custom_Token 44ba91 (3363 chars) =====
specimenZone = "c71405"

tileOffset = {-4.50, -1.50, 1.50, 4.50}
playerBoard = {"a0fa97", "042887", "e435ab", "f8a49f"}

colorRef = {["Red"] = 1, ["Blue"] = 2, ["Orange"] = 3, ["Green"] = 4}

redSupply = {-49.00, 3.5, -22.00}
blueSupply = {-6.00, 3.5, -22.00}
orangeSupply = {6.00, 3.5, -22.00}
greenSupply = {49.00, 3.5, -22.00}

function onload()
    buttonRed = 80
    buttonGreen = 20
    buttonBlue = 115

  buttonRed = buttonRed/255
  buttonGreen = buttonGreen/255
  buttonBlue = buttonBlue/255

  self.createButton({
    click_function = "sendSpec",
    function_owner = self,
    label          = "Send Specimen",
    position       = {1.70, 0.2, 1.62},
    rotation       = {0, 270, 0},
    scale          = {0.5, 1, 0.5},
    width          = 875,
    height         = 125,
    tooltip        = "",
    font_color     = {0.9, 1, 0.9},
    font_size      = 90,
    color          = {buttonRed, buttonGreen, buttonBlue},
    })

    self.createButton({
      click_function = "drawExtra",
      function_owner = self,
      label          = "Draw Card",
      position       = {1.70, 0.2, -1.85},
      rotation       = {0, 270, 0},
      scale          = {0.5, 1, 0.5},
      width          = 875,
      height         = 125,
      tooltip        = "",
      font_color     = {0.9, 1, 0.9},
      font_size      = 90,
      color          = {buttonRed, buttonGreen, buttonBlue},
      })

    buttonRed = 148
    buttonGreen = 134
    buttonBlue = 93

    buttonRed = buttonRed/255
    buttonGreen = buttonGreen/255
    buttonBlue = buttonBlue/255

  self.createButton({
    click_function = "rentSpec",
    function_owner = self,
    label          = "Return Specimen",
    position       = {1.90, 0.2, 1.62},
    rotation       = {0, 270, 0},
    scale          = {0.5, 1, 0.5},
    width          = 875,
    height         = 125,
    tooltip        = "",
    font_color     = {1, 1, 1},
    font_size      = 90,
    color          = {buttonRed, buttonGreen, buttonBlue},
    })
end

function sendSpec(GO, color)
  getObjectFromGUID(playerBoard[colorRef[color]]).call("sendSpecimen")
end

function drawExtra(GO, color)
  getObjectFromGUID(playerBoard[colorRef[color]]).call("drawCard")
end

function rentSpec(GO, color)
  negotiatorArea = getObjectFromGUID("c71405").getObjects()

  local resetSpecimenSupply = {0, 0, 0}

  if color == "Red" then
    resetSpecimenSupply = {redSupply[1] + (math.random()/2), redSupply[2], redSupply[3] + (math.random()/2)}
  elseif color == "Blue" then
    resetSpecimenSupply = {blueSupply[1] + (math.random()/2), blueSupply[2], blueSupply[3] + (math.random()/2)}
  elseif color == "Orange" then
    resetSpecimenSupply = {orangeSupply[1] + (math.random()/2), orangeSupply[2], orangeSupply[3] + (math.random()/2)}
  elseif color == "Green" then
    resetSpecimenSupply = {greenSupply[1] + (math.random()/2), greenSupply[2], greenSupply[3] + (math.random()/2)}
  end

  for _, item in ipairs(negotiatorArea) do
    if item.tag == "Block" and item.getName() == color then
      --item.setPositionSmooth(resetNegSupply, false, true)
      broadcastToAll(color .. " Player returned a Specimen from the Axolotl", stringColorToRGB(color))
      item.setPositionSmooth(resetSpecimenSupply)
      break
    end
  end
end

-- ===== Custom_Tile 9eb966 (17544 chars) =====
firstPlayerToken = "784534"
expansionImmortality = "aec572"

--Tokens
ResearchTokens = {"620e3e", "95be90", "6c8158", "4a1180"}
ResearchPosition = {{2.30, 12.47, 25.40}, {2.30, 12.47, 24.75}, {2.30, 12.48, 24.10}, {2.30, 12.48, 23.45}}
TleilaxuTokens = {"ae6966", "6806fc", "914211", "309e08"}
TleilaxuPosition = {{2.50, 12.48, 27.68}, {2.50, 12.48, 27.00}, {3.15, 12.48, 27.68}, {3.15, 12.48, 27.00}}
atomicTokens = {"6b99a0", "8bdf47", "21b506", "734e21"}
atomicTokensPosition = {{-35.00, 1.56, -20.50}, {-10.00, 1.56, -20.50}, {20.00, 1.56, -20.50}, {45.00, 1.56, -20.50}}
spiceTokens = {"940082", "1ac5d6"}
spiceTokensPosition = {}

--Imperium, Intrigue, Experimentation and Tleilaxu
deckExpansions = {"d2fd10", "6d939e", "c29438", "4d7670"}
deckExpansionPosition = {{-13.00, 3, 17.80}, {-15.50, 3, 17.81}, {41.10, 3, 19.00}, {-10.22, 12.75, 24.55}}
deckZones = {"ad3c5a", "e9f30d", "3b79d7", "f8befb"}

--Board Overlay (Research)
boardExpansions = {"44ba91"}
boardExpansionPosition = {{7.15, 12.30, 24.56}}
boardSpace = {"822554"}
boardSpacePosition = {{0.50, 11.40, 24.56}}
reclaimedForces = {"27ebc0"}
reclaimedForcesPosition = {{-0.28, 12.75, 24.55}}
troopButton = {"c828ec"}
troopPosition = {{-0.28, 12.25, 22.60}}

--Research Location
locationImages = {"a51a29"}
locationPosition = {{0.41, 1.12, 5.50}}
existingResearchStation = {"d43969"}

--Hagal IX (1P, 2P Core)
rivalHagal = {"56399d"}

--Hagal Imperium (1P, 2P, Core)
imperiumHagalBag = "aaec7d"
imperiumHagalDecks = {"2d887f", "3c22a6", "8f8cc1"}
tempHagalPos = {{-6.00, 1.75, 26.40}, {6.00, 1.75, 26.40}, {0.00, 1.75, 26.40}}

--Player Starting Deck Zones
playerDeckZones = {"97ba78", "6a6014", "4a4d87", "2570f5"}

--Setup Validation
immortalityComponents = {"822554", "4d7670" , "27ebc0", "c828ec", "44ba91", "ae6966", "6806fc", "914211", "309e08", "620e3e", "95be90", "6c8158", "4a1180", "940082", "1ac5d6"} 
immortalityComponentsPosition = {{0.50, 11.38, 24.56}, {-10.22, 12.37, 24.55}, {-0.28, 12.27, 24.55}, {-0.28, 12.25, 22.60}, {7.15, 12.30, 24.56}, {2.50, 12.47, 27.68}, {2.50, 12.47, 27.00}, {3.15, 12.47, 27.68}, {3.15, 12.47, 27.00}, {2.30, 12.47, 25.40}, {2.30, 12.47, 24.75}, {2.30, 12.47, 24.10}, {2.30, 12.47, 23.45}, {8.82, 12.45, 27.07}, {8.82, 12.64, 27.07}}

function onLoad()
  buttonRed = 80
  buttonGreen = 20
  buttonBlue = 115

  buttonRed = buttonRed/255
  buttonGreen = buttonGreen/255
  buttonBlue = buttonBlue/255

  self.clearButtons()
  self.createButton({
     click_function = "addExpansion",
     function_owner = self,
     label          = "Add Immortality Expansion",
     position       = {0.0,0.1,0.0},
     rotation       = {0, 0, 0},
     scale          = {1, 1, 1},
     width          = 3825,
     height         = 925,
     tooltip        = "",
     font_color     = {1, 1, 1},
     font_size      = 300,
    color = {buttonRed, buttonGreen, buttonBlue},
     })
end

function addExpansion()

 if getObjectFromGUID(firstPlayerToken).getVar("addIxState") != 1 then

  getObjectFromGUID(firstPlayerToken).call("expansionImmortalityStart", {})

  for _, hagalObject in ipairs(getObjectFromGUID(imperiumHagalBag).getObjects()) do
    if hagalObject.guid == imperiumHagalDecks[1] then
      hagalPull = getObjectFromGUID(imperiumHagalBag).takeObject({guid = hagalObject.guid})
      hagalPull.setPositionSmooth(tempHagalPos[1])
    elseif hagalObject.guid == imperiumHagalDecks[2] then
      hagalPull = getObjectFromGUID(imperiumHagalBag).takeObject({guid = hagalObject.guid})
      hagalPull.setPositionSmooth(tempHagalPos[2])
    elseif hagalObject.guid == imperiumHagalDecks[3] then
      hagalPull = getObjectFromGUID(imperiumHagalBag).takeObject({guid = hagalObject.guid})
      hagalPull.setPositionSmooth(tempHagalPos[3])
      for _, cardObject in ipairs(getObjectFromGUID(imperiumHagalDecks[3]).getObjects()) do
        if cardObject.name == "Carthag" then
          cardPull = getObjectFromGUID(imperiumHagalDecks[3]).takeObject({guid = cardObject.guid})
          cardPull.setPositionSmooth({14.50, 3.5, 17.80})
        end
      end
    end
  end

  for _, expansionObject in ipairs(getObjectFromGUID(expansionImmortality).getObjects()) do
    if expansionObject.guid == deckExpansions[1] then
        expansionComponent = getObjectFromGUID(expansionImmortality).takeObject({guid = expansionObject.guid})
        expansionComponent.setRotationSmooth({0.00, 180.00, 180.00})
        expansionComponent.setPositionSmooth(deckExpansionPosition[1])
        Wait.frames(function()
          deckObject = GetDeckOrCard(deckZones[1])
          deckObject.shuffle()
        end,120)
    elseif expansionObject.guid == deckExpansions[2] then
        expansionComponent = getObjectFromGUID(expansionImmortality).takeObject({guid = expansionObject.guid})
        expansionComponent.setRotationSmooth({0.00, 180.00, 180.00})
        expansionComponent.setPositionSmooth(deckExpansionPosition[2])
        Wait.frames(function()
          deckObject = GetDeckOrCard(deckZones[2])
          deckObject.shuffle()
        end,120)
    elseif expansionObject.guid == deckExpansions[3] then
        expansionComponent = getObjectFromGUID(expansionImmortality).takeObject({guid = expansionObject.guid})
        expansionComponent.setRotationSmooth({0.00, 180.00, 0.00})
        expansionComponent.setPositionSmooth(deckExpansionPosition[3])
        Wait.frames(function()
          deckObject = GetDeckOrCard(deckZones[3])
          deckObject.shuffle()
        end,120)
    elseif expansionObject.guid == boardSpace[1] then
        expansionComponentA = getObjectFromGUID(expansionImmortality).takeObject({guid = expansionObject.guid})
        expansionComponentA.setPositionSmooth(boardSpacePosition[1])
        Wait.frames(function()
          expansionComponentA.lock()
        end,60)
    end
  end

  Wait.frames(function()
  for _, expansionObject in ipairs(getObjectFromGUID(expansionImmortality).getObjects()) do
    if expansionObject.guid == locationImages[1] then
      oldLocationObject = getObjectFromGUID(existingResearchStation[1])
      oldLocationObject.setLock(false)
      oldLocationObject.setPositionSmooth({41.10, 3, 22.80})
      expansionComponentB = getObjectFromGUID(expansionImmortality).takeObject({guid = expansionObject.guid})
      expansionComponentB.setPositionSmooth(locationPosition[1])
      expansionComponentB.setRotationSmooth({0.00, 180.00, 0.00})
      Wait.frames(function()
        expansionComponentB.lock()
      end,120)
    elseif expansionObject.guid == boardExpansions[1] then
      expansionComponentC = getObjectFromGUID(expansionImmortality).takeObject({guid = expansionObject.guid})
        expansionComponentC.setRotation({0.00, 270.00, 0.00})
        expansionComponentC.setPositionSmooth({41.10, 13.00, 22.80})
      Wait.frames(function()
        expansionComponentC.setRotation({0.00, 270.00, 0.00})
        expansionComponentC.setPositionSmooth(boardExpansionPosition[1])
      end,60)
      Wait.frames(function()
        expansionComponentC.lock()
      end,120)
    elseif expansionObject.guid == deckExpansions[4] then
      expansionComponentD = getObjectFromGUID(expansionImmortality).takeObject({guid = expansionObject.guid})
        expansionComponentD.setRotationSmooth({0.00, 180.00, 180.00})
        expansionComponentD.setPositionSmooth({41.10, 15.00, 22.80})
      Wait.frames(function()
        expansionComponentD.setRotationSmooth({0.00, 180.00, 180.00})
        expansionComponentD.setPositionSmooth(deckExpansionPosition[4])
      end,60)
      Wait.frames(function()
        deckObject = GetDeckOrCard(deckZones[4])
        deckObject.shuffle()
      end,120)
    elseif expansionObject.guid == reclaimedForces[1] then
      expansionComponentE = getObjectFromGUID(expansionImmortality).takeObject({guid = expansionObject.guid})
      expansionComponentE.setRotationSmooth({0.00, 180.00, 0.00})
      expansionComponentE.setPositionSmooth({41.10, 17.00, 22.80})
      Wait.frames(function()
        expansionComponentE.setRotationSmooth({0.00, 180.00, 0.00})
        expansionComponentE.setPositionSmooth(reclaimedForcesPosition[1])
      end,60)
      Wait.frames(function()
        expansionComponentE.lock()
      end,180)
    elseif expansionObject.guid == rivalHagal[1] then
      expansionComponentF = getObjectFromGUID(expansionImmortality).takeObject({guid = expansionObject.guid})
      expansionComponentF.setPositionSmooth(tempHagalPos[1])
    end

    --Hagal Repack
    hagalBagPos = getObjectFromGUID(imperiumHagalBag).getPosition()
    hagalBagPos.y = 2.5
    Wait.frames(function()
      getObjectFromGUID(imperiumHagalDecks[1]).setPositionSmooth(hagalBagPos)
    end,120)
    Wait.frames(function()
      getObjectFromGUID(imperiumHagalDecks[2]).setPositionSmooth(hagalBagPos)
    end,180)
    Wait.frames(function()
      getObjectFromGUID(imperiumHagalDecks[3]).setPositionSmooth(hagalBagPos)
    end,240)
  end
  end,90)

  Wait.frames(function()
    for _, expansionObject in ipairs(getObjectFromGUID(expansionImmortality).getObjects()) do
      if expansionObject.guid == ResearchTokens[1] then
        expansionComponentF = getObjectFromGUID(expansionImmortality).takeObject({guid = expansionObject.guid})
        expansionComponentF.setRotation({0.00, 180.00, 180.00})
        expansionComponentF.setPositionSmooth({41.10, 21.00, 22.80})
        Wait.frames(function()
          expansionComponentF.setPositionSmooth(ResearchPosition[1])
        end,60)
      elseif expansionObject.guid == ResearchTokens[2] then
        expansionComponentG = getObjectFromGUID(expansionImmortality).takeObject({guid = expansionObject.guid})
        expansionComponentG.setRotation({0.00, 180.00, 180.00})
        expansionComponentG.setPositionSmooth({41.10, 20.00, 22.80})
        Wait.frames(function()
          expansionComponentG.setPositionSmooth(ResearchPosition[2])
        end,60)
      elseif expansionObject.guid == ResearchTokens[3] then
        expansionComponentH = getObjectFromGUID(expansionImmortality).takeObject({guid = expansionObject.guid})
        expansionComponentH.setRotation({0.00, 180.00, 180.00})
        expansionComponentH.setPositionSmooth({41.10, 19.00, 22.80})
        Wait.frames(function()
          expansionComponentH.setPositionSmooth(ResearchPosition[3])
        end,60)
      elseif expansionObject.guid == ResearchTokens[4] then
        expansionComponentI = getObjectFromGUID(expansionImmortality).takeObject({guid = expansionObject.guid})
        expansionComponentI.setRotation({0.00, 180.00, 180.00})
        expansionComponentI.setPositionSmooth({41.10, 18.00, 22.80})
        Wait.frames(function()
          expansionComponentI.setPositionSmooth(ResearchPosition[4])
        end,60)
      elseif expansionObject.guid == TleilaxuTokens[1] then
        expansionComponentJ = getObjectFromGUID(expansionImmortality).takeObject({guid = expansionObject.guid})
        expansionComponentJ.setRotation({0.00, 180.00, 180.00})
        expansionComponentJ.setPositionSmooth({41.10, 18.00, 18.80})
        Wait.frames(function()
          expansionComponentJ.setPositionSmooth(TleilaxuPosition[1])
        end,60)
      elseif expansionObject.guid == TleilaxuTokens[2] then
        expansionComponentK = getObjectFromGUID(expansionImmortality).takeObject({guid = expansionObject.guid})
        expansionComponentK.setRotation({0.00, 180.00, 180.00})
        expansionComponentK.setPositionSmooth({41.10, 18.00, 19.80})
        Wait.frames(function()
          expansionComponentK.setPositionSmooth(TleilaxuPosition[2])
        end,60)
      elseif expansionObject.guid == TleilaxuTokens[3] then
        expansionComponentL = getObjectFromGUID(expansionImmortality).takeObject({guid = expansionObject.guid})
        expansionComponentL.setRotation({0.00, 180.00, 180.00})
        expansionComponentL.setPositionSmooth({41.10, 18.00, 20.80})
        Wait.frames(function()
          expansionComponentL.setPositionSmooth(TleilaxuPosition[3])
        end,60)
      elseif expansionObject.guid == TleilaxuTokens[4] then
        expansionComponentM = getObjectFromGUID(expansionImmortality).takeObject({guid = expansionObject.guid})
        expansionComponentM.setRotation({0.00, 180.00, 180.00})
        expansionComponentM.setPositionSmooth({41.10, 18.00, 21.80})
        Wait.frames(function()
          expansionComponentM.setPositionSmooth(TleilaxuPosition[4])
        end,60)
      elseif expansionObject.guid == atomicTokens[1] then
        expansionComponentN = getObjectFromGUID(expansionImmortality).takeObject({guid = expansionObject.guid})
        expansionComponentN.setRotation({0.00, 180.00, 0.00})
        expansionComponentN.setPositionSmooth(atomicTokensPosition[1])
        Wait.frames(function()
          expansionComponentN.lock()
        end,210)
      elseif expansionObject.guid == atomicTokens[2] then
        expansionComponentO = getObjectFromGUID(expansionImmortality).takeObject({guid = expansionObject.guid})
        expansionComponentO.setRotation({0.00, 180.00, 0.00})
        expansionComponentO.setPositionSmooth(atomicTokensPosition[2])
        Wait.frames(function()
          expansionComponentO.lock()
        end,210)
      elseif expansionObject.guid == atomicTokens[3] then
        expansionComponentP = getObjectFromGUID(expansionImmortality).takeObject({guid = expansionObject.guid})
        expansionComponentP.setRotation({0.00, 180.00, 0.00})
        expansionComponentP.setPositionSmooth(atomicTokensPosition[3])
        Wait.frames(function()
          expansionComponentP.lock()
        end,210)
      elseif expansionObject.guid == atomicTokens[4] then
        expansionComponentQ = getObjectFromGUID(expansionImmortality).takeObject({guid = expansionObject.guid})
        expansionComponentQ.setRotation({0.00, 180.00, 0.00})
        expansionComponentQ.setPositionSmooth(atomicTokensPosition[4])
        Wait.frames(function()
          expansionComponentQ.lock()
        end,210)
      elseif expansionObject.guid == "940082" then
        expansionComponentR = getObjectFromGUID(expansionImmortality).takeObject({guid = expansionObject.guid})
        expansionComponentR.setRotation({0.00, 180.00, 0.00})
        expansionComponentR.setPositionSmooth({41.10, 20.00, 22.80})
        Wait.frames(function()
          expansionComponentR.setPositionSmooth({8.82, 12.55, 27.07})
        end,60)
      elseif expansionObject.guid == "1ac5d6" then
        expansionComponentS = getObjectFromGUID(expansionImmortality).takeObject({guid = expansionObject.guid})
        expansionComponentS.setRotation({0.00, 180.00, 0.00})
        expansionComponentS.setPositionSmooth({41.10, 21.50, 22.80})
        Wait.frames(function()
          expansionComponentS.setPositionSmooth({8.82, 12.75, 27.07})
        end,60)
      end
    end
  end,180)

  Wait.frames(function()
    getObjectFromGUID(troopButton[1]).setPositionSmooth({41.10, 18.00, 25.80})
    getObjectFromGUID(troopButton[1]).setRotationSmooth({0.00, 180.00, 0.00})     
    Wait.frames(function()
      getObjectFromGUID(troopButton[1]).setPositionSmooth(troopPosition[1])
      getObjectFromGUID(troopButton[1]).setRotationSmooth({0.00, 180.00, 0.00})
      getObjectFromGUID(troopButton[1]).lock()
    end,60)

  end,180)

  Wait.frames(function()
    for i=1,4 do
      deckObjectTemp = GetDeckOrCard(playerDeckZones[i])
      for _, cardObject in ipairs(deckObjectTemp.getObjects()) do
        if cardObject.description == "Desert Planet" then
          cardPull = deckObjectTemp.takeObject({guid = cardObject.guid})
          cardPull.setPositionSmooth({14.50, 3.5, 17.80})
        end
      end
    end
  end,210)

  Wait.frames(function()
    playerCardCount = 0
    trackingSpot = 1

    deckObjectTempB = GetDeckOrCard(deckZones[3])

    for j=1, 8 do
      if deckObjectTempB.name == "Deck" then
        card = deckObjectTempB.takeObject()
      elseif deckObjectTempB.name == "Card" then
        card = deckObjectTempB
      end
      playerDeckObject = GetDeckOrCard(playerDeckZones[trackingSpot])
      tempPlayerPos = playerDeckObject.getPosition()
      tempPlayerPos.y = 3.5
      card.setRotation({0.00, 180.00, 180.00})
      card.setPositionSmooth(tempPlayerPos)
      playerCardCount = playerCardCount + 1
      if playerCardCount == 2 or playerCardCount == 4 or playerCardCount == 6 then
        trackingSpot = trackingSpot + 1
      end
    end
  end,240)

  Wait.frames(function()
    for tokenCheck = 1, 13 do
      getObjectFromGUID(immortalityComponents[tokenCheck]).setPosition(immortalityComponentsPosition[tokenCheck])
    end
    getObjectFromGUID(firstPlayerToken).call("expansionImmortalityAdded", {})
  end,390)

  getObjectFromGUID(firstPlayerToken).call("expansionImmortality", {})
  self.destruct()
 else
  broadcastToAll("Wait for the Rise of IX Expansion Process to Complete")
 end
  getObjectFromGUID(firstPlayerToken).call("displayEleven", {})
end

function GetDeckOrCard(zoneGUID)
  for _, obj in ipairs(getObjectFromGUID(zoneGUID).getObjects()) do
    if obj.name == "Card" or obj.name == "CardCustom" or obj.name == "Deck" or obj.name == "DeckCustom" then
      return obj
    end
  end

 return nil
end

-- ===== Custom_PDF 74b4ea (5793 chars) =====
function onLoad()
    buttonRed = 80
    buttonGreen = 20
    buttonBlue = 115
  
    buttonRed = buttonRed/255
    buttonGreen = buttonGreen/255
    buttonBlue = buttonBlue/255
  
    self.clearButtons()
    self.createButton ({
      ['click_function'] = 'overviewPage',
      ['label'] = 'Overview',
      ['function_owner'] = self,
      ['position'] = {-3.6, 0.3, -1.3},
      ['rotation'] =  {0, 0, 0},
      ['scale'] = {0.7,1,0.7},
      ['width'] = 900,
      ['height'] = 200,
      ['font_size'] = 100,
      ['color'] = {buttonRed, buttonGreen, buttonBlue},
      ['font_color'] = "White"
    })
    self.createButton ({
      ['click_function'] = 'setupPage',
      ['label'] = 'Setup',
      ['function_owner'] = self,
      ['position'] = {-3.6, 0.3, -1.0},
      ['rotation'] =  {0, 0, 0},
      ['scale'] = {0.7,1,0.7},
      ['width'] = 900,
      ['height'] = 200,
      ['font_size'] = 100,
      ['color'] = {buttonRed, buttonGreen, buttonBlue},
      ['font_color'] = "White"
    })
    self.createButton ({
      ['click_function'] = 'researchPage',
      ['label'] = 'Research Track',
      ['function_owner'] = self,
      ['position'] = {-3.6, 0.3, -0.7},
      ['rotation'] =  {0, 0, 0},
      ['scale'] = {0.7,1,0.7},
      ['width'] = 900,
      ['height'] = 200,
      ['font_size'] = 100,
      ['color'] = {buttonRed, buttonGreen, buttonBlue},
      ['font_color'] = "White"
    })
    self.createButton ({
      ['click_function'] = 'tleilaxuPage',
      ['label'] = 'Tleilaxu Track',
      ['function_owner'] = self,
      ['position'] = {-3.6, 0.3, -0.4},
      ['rotation'] =  {0, 0, 0},
      ['scale'] = {0.7,1,0.7},
      ['width'] = 900,
      ['height'] = 200,
      ['font_size'] = 100,
      ['color'] = {buttonRed, buttonGreen, buttonBlue},
      ['font_color'] = "White"
    })
    self.createButton ({
      ['click_function'] = 'cardsPage',
      ['label'] = 'Tleilaxu Cards',
      ['function_owner'] = self,
      ['position'] = {-3.6, 0.3, -0.1},
      ['rotation'] =  {0, 0, 0},
      ['scale'] = {0.7,1,0.7},
      ['width'] = 900,
      ['height'] = 200,
      ['font_size'] = 100,
      ['color'] = {buttonRed, buttonGreen, buttonBlue},
      ['font_color'] = "White"
    })
    self.createButton ({
      ['click_function'] = 'graftPage',
      ['label'] = 'Graft',
      ['function_owner'] = self,
      ['position'] = {-3.6, 0.3, 0.2},
      ['rotation'] =  {0, 0, 0},
      ['scale'] = {0.7,1,0.7},
      ['width'] = 900,
      ['height'] = 200,
      ['font_size'] = 100,
      ['color'] = {buttonRed, buttonGreen, buttonBlue},
      ['font_color'] = "White"
    })
    self.createButton ({
      ['click_function'] = 'atomicsPage',
      ['label'] = 'Family Atomics',
      ['function_owner'] = self,
      ['position'] = {-3.6, 0.3, 0.5},
      ['rotation'] =  {0, 0, 0},
      ['scale'] = {0.7,1,0.7},
      ['width'] = 900,
      ['height'] = 200,
      ['font_size'] = 100,
      ['color'] = {buttonRed, buttonGreen, buttonBlue},
      ['font_color'] = "White"
    })
    self.createButton ({
      ['click_function'] = 'variantPage',
      ['label'] = 'Variants',
      ['function_owner'] = self,
      ['position'] = {-3.6, 0.3, 0.8},
      ['rotation'] =  {0, 0, 0},
      ['scale'] = {0.7,1,0.7},
      ['width'] = 900,
      ['height'] = 200,
      ['font_size'] = 100,
      ['color'] = {buttonRed, buttonGreen, buttonBlue},
      ['font_color'] = "White"
    })
    self.createButton ({
        ['click_function'] = 'soloPage',
        ['label'] = 'Solo Game Mode',
        ['function_owner'] = self,
        ['position'] = {-3.6, 0.3, 1.1},
        ['rotation'] =  {0, 0, 0},
        ['scale'] = {0.7,1,0.7},
        ['width'] = 900,
        ['height'] = 200,
        ['font_size'] = 100,
        ['color'] = {buttonRed, buttonGreen, buttonBlue},
        ['font_color'] = "White"
      })
    self.createButton ({
      ['click_function'] = 'referencePage',
      ['label'] = 'Clarifications',
      ['function_owner'] = self,
      ['position'] = {-3.6, 0.3, 1.4},
      ['rotation'] =  {0, 0, 0},
      ['scale'] = {0.7,1,0.7},
      ['width'] = 900,
      ['height'] = 200,
      ['font_size'] = 100,
      ['color'] = {buttonRed, buttonGreen, buttonBlue},
      ['font_color'] = "White"
    })
    self.createButton ({
        ['click_function'] = 'iconsPage',
        ['label'] = 'New Icons',
        ['function_owner'] = self,
        ['position'] = {-3.6, 0.3, 1.7},
        ['rotation'] =  {0, 0, 0},
        ['scale'] = {0.7,1,0.7},
        ['width'] = 900,
        ['height'] = 200,
        ['font_size'] = 100,
        ['color'] = {buttonRed, buttonGreen, buttonBlue},
        ['font_color'] = "White"
      })
  end
  
  function overviewPage()
    getObjectFromGUID("74b4ea").book.setPage(1)
  end
  
  function setupPage()
    getObjectFromGUID("74b4ea").book.setPage(3)
  end
  
  function researchPage()
    getObjectFromGUID("74b4ea").book.setPage(5)
  end
  
  function tleilaxuPage()
    getObjectFromGUID("74b4ea").book.setPage(6)
  end

  function cardsPage()
    getObjectFromGUID("74b4ea").book.setPage(7)
  end
  
  function graftPage()
    getObjectFromGUID("74b4ea").book.setPage(9)
  end
  
  function atomicsPage()
    getObjectFromGUID("74b4ea").book.setPage(11)
  end
  
  function variantPage()
    getObjectFromGUID("74b4ea").book.setPage(11)
  end
  
  function soloPage()
    getObjectFromGUID("74b4ea").book.setPage(12)
  end

  function referencePage()
    getObjectFromGUID("74b4ea").book.setPage(13)
  end
  
  function iconsPage()
    getObjectFromGUID("74b4ea").book.setPage(15)
  end

-- ===== Custom_Tile c828ec (962 chars) =====
playerBoards = {['Red'] = "a0fa97", ['Blue'] = "042887", ['Orange'] = "e435ab", ['Green'] = "f8a49f"}

buttonRed = 80
buttonGreen = 20
buttonBlue = 115

buttonRed = buttonRed/255
buttonGreen = buttonGreen/255
buttonBlue = buttonBlue/255

function onLoad()
  self.clearButtons()
  self.createButton({
     click_function = "addToGarrison",
     function_owner = self,
     label          = "Recruit Two Troops",
     position       = {0.0,0.1,0.0},
     rotation       = {0, 0, 0},
     scale          = {1, 1, 1},
     width          = 3800,
     height         = 850,
     tooltip        = "",
     font_color     = {1, 1, 1},
     font_size      = 375,
     color = {buttonRed, buttonGreen, buttonBlue},
     })
end

function addToGarrison(GO, color)
  getObjectFromGUID(playerBoards[color]).call("addGarrison",{})

  Wait.frames(function()
    getObjectFromGUID(playerBoards[color]).call("addGarrison",{})  
  end,45)
  
end
