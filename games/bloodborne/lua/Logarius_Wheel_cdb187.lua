function onCollisionEnter(info)
    playerMat = info.collision_object
  if playerMat.getName() == "Hunter Dashboard" then
      local matColor = playerMat.getColorTint()
      local params = {}
      params.position = playerMat.getPosition()

      for k, v in pairs(self.getObjects()) do
          local descrip = v.description
          if descrip == "Hunter" then
              local newPos = {}
              newPos.guid = v.guid
              newPos.position = {params.position.x + -8.22, params.position.y + 2, params.position.z + 8.65}
              self.takeObject(newPos).setColorTint(matColor)
          end--end if the long hunt
          if descrip == "Firearm" then
              local newPos = {}
              newPos.guid = v.guid
              newPos.position = {params.position.x + 5.43, params.position.y + 2, params.position.z + 4.43}
              newPos.rotation = {0,180,180}
              self.takeObject(newPos)
          end--end if the long hunt
          if descrip == "Trick Weapon" then
              local newPos = {}
              newPos.guid = v.guid
              newPos.position = {params.position.x + 0.1, params.position.y + 2, params.position.z + -4.05}
              newPos.rotation = {0,180,0}
              self.takeObject(newPos)
          end--end if the long hunt
      end--end for
      self.destruct()
  end--end ifhunterMat
end--end function
