campaignPos = {position = {-9.56, 10.84, -85.64}, rotation = {0.00, 180.00, 0.00}}
enemyActionPos = {position = {-5.25, 10.63, -58.50}, rotation = {0.00, 180.00, 180.00}}
consumablePos = {position = {17.20, 10.78, -70.70}, rotation = {0.00, 180.00, 180.00}}
rewardPos = {position = {17.20, 10.72, -78.80}, rotation = {0.00, 180.00, 0.00}}
firearmPos = {position = {24.30, 10.64, -78.80}, rotation = {0.00, 180.00, 180.00}}
upgradeStatPos = {position = {17.22, 10.89, -86.95}, rotation = {0.00, 180.00, 180.00}}
mapTilePos = {position = {44.60, 10.70, -80.00}, rotation = {0.00, 180.00, 180.00}}

midDeckPos = {position = {19.33, 10.70, -58.57}, rotation = {0.00, 180.00, 180.00}}
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
        if name == "Queen's Legacy" then
            params.guid = v.guid
            params.position = campaignPos.position
            params.rotation = campaignPos.rotation
            self.takeObject(params)
        end--end if campaign
        if name == "Forsaken Cainhurst Castle Tiles" then
            params.guid = v.guid
            params.position = mapTilePos.position
            params.rotation = mapTilePos.rotation
            self.takeObject(params)
        end--end if map tiles
---------------Non Static Items-------------------------------------------------
        if name == "Enemies" then
            params.guid = v.guid
            params.position = enemyPos.position
            params.rotation = enemyPos.rotation
            self.takeObject(params)
        end--end if
        if name == "Lost Child of Antiquity" then
            params.guid = v.guid
            params.position = m1Pos.position
            params.rotation = m1Pos.rotation
            self.takeObject(params)
        end--end if
        if name == "Bloodlicker / Starved" then
            params.guid = v.guid
            params.position = m2Pos.position
            params.rotation = m2Pos.rotation
            self.takeObject(params)
        end--end if
    end--end for
    self.destruct()
end--end function
