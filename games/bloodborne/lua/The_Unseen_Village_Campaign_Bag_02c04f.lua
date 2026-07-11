campaignPos = {position = {-9.56, 10.84, -85.64}, rotation = {0.00, 180.00, 0.00}}
enemyActionPos = {position = {-5.25, 10.63, -58.50}, rotation = {0.00, 180.00, 180.00}}
consumablePos = {position = {17.20, 10.78, -70.70}, rotation = {0.00, 180.00, 180.00}}
rewardPos = {position = {17.20, 10.72, -78.80}, rotation = {0.00, 180.00, 0.00}}
firearmPos = {position = {24.30, 10.64, -78.80}, rotation = {0.00, 180.00, 180.00}}
upgradeStatPos = {position = {17.22, 10.89, -86.95}, rotation = {0.00, 180.00, 180.00}}
mapTilePos = {position = {44.60, 10.70, -80.00}, rotation = {0.00, 180.00, 180.00}}

midDeckPos = {position = {19.33, 10.70, -58.57}, rotation = {0.00, 180.00, 180.00}}
rightDeckPos = {position = {42.90, 10.63, -58.57}, rotation = {0.00, 180.00, 180.00}}
enemyPos = {position = {-9.41, 10.54, -74.45}, rotation = {0.00, 180.00, 180.00}}
m1Pos = {position = {17.00, 10.30, -64.00}, rotation = {0.00, 0.00, 0.00}}
m2Pos = {position = {21.00, 10.30, -64.00}, rotation = {0.00, 0.00, 0.00}}
m3Pos = {position = {25.00, 10.30, -64.00}, rotation = {0.00, 0.00, 0.00}}

function onCollisionEnter(info)
    huntMat = info.collision_object
    if huntMat.getName() == "Hunt Board" then
        setPlayArea()
    end--end ifhunterMat
end--end function

function setPlayArea()
    for k, v in pairs(self.getObjects()) do
        local params = {}
        local name = v.name
        if name == "The Unseen Village" then
            params.guid = v.guid
            params.position = campaignPos.position
            params.rotation = campaignPos.rotation
            self.takeObject(params)
        end--end if campaign
        if name == "Enemy Action Deck" then
            params.guid = v.guid
            params.position = enemyActionPos.position
            params.rotation = enemyActionPos.rotation
            self.takeObject(params).shuffle()
        end--end if enemyAction
        if name == "Consumable Deck" then
            params.guid = v.guid
            params.position = consumablePos.position
            params.rotation = consumablePos.rotation
            self.takeObject(params).shuffle()
        end--end if consumable
        if name == "Reward Deck" then
            params.guid = v.guid
            params.position = rewardPos.position
            params.rotation = rewardPos.rotation
            self.takeObject(params)
        end--end if reward
        if name == "Firearm Deck" then
            params.guid = v.guid
            params.position = firearmPos.position
            params.rotation = firearmPos.rotation
            self.takeObject(params)
        end--end if firearm
        if name == "Upgrade Stat Deck" then
            statUpgrade_GUID = v.guid
            params.guid = statUpgrade_GUID
            params.position = upgradeStatPos.position
            params.rotation = upgradeStatPos.rotation
            self.takeObject(params).shuffle()
            drawUpgradeCards()
        end--end if upgrade stat deck
        if name == "Core Tiles" then
            params.guid = v.guid
            params.position = mapTilePos.position
            params.rotation = mapTilePos.rotation
            self.takeObject(params)
        end--end if map tiles
---------------Non Static Items-------------------------------------------------
        if name == "Yahar'gul Chapter 2 Deck" then
            params.guid = v.guid
            params.position = midDeckPos.position
            params.rotation = midDeckPos.rotation
            self.takeObject(params)
        end--end if
        if name == "Yahar'gul Chapter 3 Deck" then
            params.guid = v.guid
            params.position = rightDeckPos.position
            params.rotation = rightDeckPos.rotation
            self.takeObject(params)
        end--end if enemies
        if name == "Enemies" then
            params.guid = v.guid
            params.position = enemyPos.position
            params.rotation = enemyPos.rotation
            self.takeObject(params)
        end--end if enemies
        if name == "Hunter Mob" then
            params.guid = v.guid
            params.position = m1Pos.position
            params.rotation = m1Pos.rotation
            self.takeObject(params)
        end--end if m1
        if name == "Scourge Beast" then
            params.guid = v.guid
            params.position = m2Pos.position
            params.rotation = m2Pos.rotation
            self.takeObject(params)
        end--end if m1
        if name == "Kidnapper" then
            params.guid = v.guid
            params.position = m3Pos.position
            params.rotation = m3Pos.rotation
            self.takeObject(params)
        end--end if m1
    end--end for
    self.destruct()
end--end function

card = {{position = {-3.16, 10.52, -86.92}, rotation = {0.00, 180.00, 0.00}},
        {position = {1.45, 10.52, -86.92}, rotation = {0.00, 180.00, 0.00}},
        {position = {6.07, 10.52, -86.91}, rotation = {0.00, 180.00, 0.00}},
        {position = {10.66, 10.52, -86.91}, rotation = {0.00, 180.00, 0.00}}}

function drawUpgradeCards()
    statUpgrade = getObjectFromGUID(statUpgrade_GUID)
    for i = 1, 4 do
        statUpgrade.takeObject(card[i])
    end
end
