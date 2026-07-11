campaignPos = {position = {94.00, 10.60, -73.00}, rotation = {0.00, 180.00, 0.00}}
mapTilePos = {position = {76.00, 10.56, -80.00}, rotation = {0.00, 180.00, 180.00}}

m1Pos = {position = {94.00, 10.30, -80.00}, rotation = {0.00, 0.00, 0.00}}
m2Pos = {position = {94.00, 10.30, -84.00}, rotation = {0.00, 0.00, 0.00}}
m3Pos = {position = {94.00, 10.50, -89.00}, rotation = {0.00, 180.00, 0.00}}

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
        if name == "Forsaken Legacy" then
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
        if name == "Cainhurst Summons" then
            params.guid = v.guid
            params.position = m3Pos.position
            params.rotation = m3Pos.rotation
            self.takeObject(params)
        end--end if
    end--end for
    self.destruct()
end--end function
