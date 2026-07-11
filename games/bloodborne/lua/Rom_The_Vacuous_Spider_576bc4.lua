--[[StartXML

<Defaults>
  <Button onClick="onClick" fontSize="80" fontStyle="Bold" textColor="#FFFFFF" color="#000000F0"/>
  <Text fontSize="80" fontStyle="Bold" color="#FFFFFF"/>
  <InputField fontSize="70" color="#000000F0" textColor="#FFFFFF" characterValidation="Integer"/>
</Defaults>

<Panel id="panel" position="0 0 -220" rotation="90 270 90" scale="0.4 0.4">
<VerticalLayout id="bars" height="100">
  <Panel id="ressourceBar" active="true">
    <ProgressBar id="progressBar" visibility="" height="100" width="600" showPercentageText="false" color="#000000E0" percentage="100" fillImageColor="#710000"></ProgressBar>
    <Text id="hpText" visibility="" height="100" width="600" text="10/10"></Text>
    <HorizontalLayout height="100" width="600">
       <Button id="leftSide" text="" color="#00000000"></Button>
       <Button id="editButton" color="#00000000"></Button>
       <Button id="editButtonS" text="" color="#00000000"></Button>
    </HorizontalLayout>
    <Panel id="addSub" visibility="" height="100" width="825" active="false">
      <HorizontalLayout spacing="625">
        <Button id="sub" text="-" color="#FFFFFF" textColor="#000000"></Button>
        <Button id="add" text="+" color="#FFFFFF" textColor="#000000"></Button>
      </HorizontalLayout>
    </Panel>
  </Panel>
  <Panel id="ressourceBarS" active="true">
    <ProgressBar id="progressBarS" visibility="" height="100" width="600" showPercentageText="false" color="#000000E0" percentage="100" fillImageColor="#000071"></ProgressBar>
    <Text id="manaText" visibility="" height="100" width="600" text="10/10"></Text>
    <Panel id="addSubS" visibility="" height="100" width="825" active="false">
      <HorizontalLayout spacing="625">
        <Button id="subS" text="-" color="#FFFFFF" textColor="#000000"></Button>
        <Button id="addS" text="+" color="#FFFFFF" textColor="#000000"></Button>
      </HorizontalLayout>
    </Panel>
  </Panel>
  <Panel id="extraBar" active="true">
    <ProgressBar id="extraProgress" visibility="" height="100" width="600" showPercentageText="false" color="#000000E0" percentage="100" fillImageColor="#FFCF00"></ProgressBar>
    <Text id="extraText" visibility="" height="100" width="600" text="10/10"></Text>
    <Panel id="addSubE" visibility="" height="100" width="825" active="false">
      <HorizontalLayout spacing="625">
        <Button id="subE" text="-" color="#FFFFFF" textColor="#000000"></Button>
        <Button id="addE" text="+" color="#FFFFFF" textColor="#000000"></Button>
      </HorizontalLayout>
    </Panel>
  </Panel>
  </VerticalLayout>
  <Panel id="editPanel" height="620" width="600" position="0 970 0" active="False">
    <VerticalLayout>
      <HorizontalLayout minheight="160">
        <Button id="BZ" fontSize="70" text="Below Zero" color="#000000F0"></Button>
        <Button id="AM" fontSize="70" text="Above Max" color="#000000F0"></Button>
      </HorizontalLayout>
      <HorizontalLayout minheight="160">
        <Button id="BB" fontSize="70" text="Base Buttons" color="#000000F0"></Button>
        <Button id="HB" fontSize="70" text="HP Bar Buttons" color="#000000F0"></Button>
      </HorizontalLayout>
      <HorizontalLayout minheight="100">
        <Button id="HM" fontSize="70" text="Hide Ressource Bar" color="#000000F0"></Button>
      </HorizontalLayout>
      <HorizontalLayout minheight="100">
        <Button id="HE" fontSize="70" text="Hide Extra Bar" color="#000000F0"></Button>
      </HorizontalLayout>
      <HorizontalLayout spacing="10" minheight="100">
        <Button id="subHeight" text="◄"></Button>
        <Text>Height</Text>
        <Button id="addHeight" text="►"></Button>
      </HorizontalLayout>
      <HorizontalLayout spacing="10" minheight="100">
        <Button id="subRotation" text="◄" minwidth="90"></Button>
        <Text>Rotation</Text>
        <Button id="addRotation" text="►" minwidth="90"></Button>
      </HorizontalLayout>
      <HorizontalLayout spacing="55"  minheight="100">
        <Button id="subMax" text="◄"></Button>
        <Text>Max</Text>
        <Button id="addMax" text="►"></Button>
      </HorizontalLayout>
      <HorizontalLayout spacing="55"  minheight="100">
        <Button id="subMaxS" text="◄" minwidth="90"></Button>
        <Text>Max R</Text>
        <Button id="addMaxS" text="►" minwidth="90"></Button>
      </HorizontalLayout>
      <HorizontalLayout spacing="55"  minheight="100">
        <Button id="subMaxE" text="◄" minwidth="90"></Button>
        <Text>Max E</Text>
        <Button id="addMaxE" text="►" minwidth="90"></Button>
      </HorizontalLayout>
      <HorizontalLayout spacing="10" minheight="100">
        <Text fontSize="50">Increment by:</Text>
        <InputField id="increment" onEndEdit="onEndEdit" minwidth="200" text="1"></InputField>
      </HorizontalLayout>
    </VerticalLayout>
  </Panel>
  <Panel id="statePanel" height="300" width="-5" position="0 370 0">
    <VerticalLayout>
      <HorizontalLayout spacing="5">
      <Button id="Poison" color="#FFFFFF00" active="false"><Image image="Poison" preserveAspect="true"></Image></Button>
<Button id="Frenzy" color="#FFFFFF00" active="false"><Image image="Frenzy" preserveAspect="true"></Image></Button>

      </HorizontalLayout>
    </VerticalLayout>
  </Panel>
</Panel>
StopXML--xml]]statNames = {Poison = false, Frenzy = false}

health = {value = 8, max = 8}
mana = {value = 0, max = 0}
extra = {value = 10, max = 10}

player = false

options = {
    HP2Desc = false,
    belowZero = false,
    aboveMax = false,
    heightModifier = 9500,
    showBaseButtons = false,
    showBarButtons = false,
    hideHp = false,
    hideMana = true,
    hideExtra = true,
    incrementBy = 1,
    rotation = 270
}


function onLoad(save_state)
  if save_state ~= "" then
    saved_data = JSON.decode(save_state)
    if saved_data.health then
      for heal,_ in pairs(health) do
        health[heal] = saved_data.health[heal]
      end
    end
    if saved_data.mana then
      for res,_ in pairs(mana) do
        mana[res] = saved_data.mana[res]
      end
    end
    if saved_data.extra then
      for res,_ in pairs(extra) do
        extra[res] = saved_data.extra[res]
      end
    end
    if saved_data.options then
      for opt,_ in pairs(options) do
        options[opt] = saved_data.options[opt]
      end
    end
    if saved_data.statNames then
      for stat,_ in pairs(statNames) do
        statNames[stat] = saved_data.statNames[stat]
      end
    end
  end
  local script = self.getLuaScript()
  local xml = script:sub(script:find("StartXML")+8, script:find("StopXML")-1)
  self.UI.setXml(xml)
  Wait.frames(load, 10)
end

function load()
  self.UI.setAttribute("panel", "position", "0 0 -" .. self.getBounds().size.y / self.getScale().y * options.heightModifier)
  self.UI.setAttribute("progressBar", "percentage", health.value / health.max * 100)
  self.UI.setAttribute("hpText", "text", health.value .. "/" .. health.max)
  self.UI.setAttribute("progressBarS", "percentage", mana.value / mana.max * 100)
  self.UI.setAttribute("manaText", "text", mana.value .. "/" .. mana.max)
  self.UI.setAttribute("extraProgress", "percentage", extra.value / extra.max * 100)
  self.UI.setAttribute("extraText", "text", extra.value .. "/" .. extra.max)
  self.UI.setAttribute("manaText", "textColor", "#FFFFFF")
  self.UI.setAttribute("increment", "text", options.incrementBy)

  for i,j in pairs(statNames) do
    if j == true then
      self.UI.setAttribute(i, "active", true)
    end
  end
  Wait.frames(function() self.UI.setAttribute("statePanel", "width", getStatsCount()*300) end, 1)

  if options.showBarButtons then
    self.UI.setAttribute("addSub", "active", true)
    self.UI.setAttribute("addSubS", "active", true)
    self.UI.setAttribute("addSubE", "active", true)
  end

  self.UI.setAttribute("ressourceBar", "active", options.hideHp == true and "False" or "True")
  self.UI.setAttribute("ressourceBarS", "active", options.hideMana == true and "False" or "True")
  self.UI.setAttribute("extraBar", "active", options.hideExtra == true and "False" or "True")
  self.UI.setAttribute("addSub", "active", options.showBarButtons == true and "True" or "False")
  self.UI.setAttribute("addSubS", "active", options.showBarButtons == true and "True" or "False")
  self.UI.setAttribute("addSubE", "active", options.showBarButtons == true and "True" or "False")
  self.UI.setAttribute("panel", "rotation", options.rotation .. " 270 90")

  if options.showBaseButtons then
    createBtns()
  end
end

function onSave()
  local save_state = JSON.encode({health = health, mana = mana, extra = extra, options = options, statNames = statNames})
  self.script_state = save_state
end

function createBtns()
  local buttonParameter = {click_function = "add", function_owner = self, position = {0.3, 0.04, 0.4}, label = "+", width = 250, height = 250, font_size = 300, color = {0,0,0,0}, font_color = {0,0,0,100}}
  self.createButton(buttonParameter)
  buttonParameter.position = {-0.3, 0.04, 0.4}
  buttonParameter.click_function = "sub"
  buttonParameter.label = "-"
  self.createButton(buttonParameter)
end

function add() onClick(-1, - 1, "add") end
function sub() onClick(-1, - 1, "sub")end

function onEndEdit(player, value, id)
  options.incrementBy = value
end

function onClickEx(params)
  onClick(params.player, params.value, params.id)
end

function onClick(player, value, id)
  if id == "editButton" then
    if self.UI.getAttribute("editPanel", "active") == "False" or self.UI.getAttribute("editPanel", "active") == nil then
      self.UI.setAttribute("editPanel", "active", true)
    else
      self.UI.setAttribute("editPanel", "active", false)
    end
  elseif id == "subHeight" or id == "addHeight" then
    if id == "addHeight" then
      options.heightModifier = options.heightModifier + options.incrementBy
    else
      options.heightModifier = options.heightModifier - options.incrementBy
    end
    self.UI.setAttribute("panel", "position", "0 0 -" .. self.getBounds().size.y / self.getScale().y * options.heightModifier)
  elseif id == "subRotation" or id == "addRotation" then
    if id == "addRotation" then
      options.rotation = options.rotation + options.incrementBy
    else
      options.rotation = options.rotation - options.incrementBy
    end
    self.UI.setAttribute("panel", "rotation", options.rotation .. " 270 90")
  elseif id == "BB" then
    if options.showBaseButtons then
      self.clearButtons()
      options.showBaseButtons = false
    else
      createBtns()
      options.showBaseButtons = true
    end
  elseif id == "HM" then
    options.hideMana = not options.hideMana
    local vertical = self.UI.getAttribute("bars", "height")
    Wait.frames(function()
      self.UI.setAttribute("ressourceBarS", "active", options.hideMana == true and "False" or "True")
      self.UI.setAttribute("bars", "height", vertical + (options.hideMana == true and -100 or 100))
    end, 1)
  elseif id == "HE" then
    options.hideExtra = not options.hideExtra
    local vertical = self.UI.getAttribute("bars", "height")
    Wait.frames(function()
      self.UI.setAttribute("extraBar", "active", options.hideExtra == true and "False" or "True")
      self.UI.setAttribute("bars", "height", vertical + (options.hideExtra == true and -100 or 100))
    end, 1)
  elseif id == "HB" or id == "editButtonS" then
    if options.showBarButtons then
      self.UI.setAttribute("addSub", "active", false)
      self.UI.setAttribute("addSubS", "active", false)
      self.UI.setAttribute("addSubE", "active", false)
      options.showBarButtons = false
    else
      self.UI.setAttribute("addSub", "active", true)
      self.UI.setAttribute("addSubS", "active", true)
      self.UI.setAttribute("addSubE", "active", true)
      options.showBarButtons = true
    end
  elseif id == "BZ" then
    if options.belowZero then
      options.belowZero = false
      broadcastToAll("Below Zero Denied!", {1,1,1})
    else
      options.belowZero = true
      broadcastToAll("Below Zero allowed!", {1,1,1})
    end
  elseif id == "AM" then
    if options.aboveMax then
      options.aboveMax = false
      broadcastToAll("Above Max Denied!", {1,1,1})
    else
      options.aboveMax = true
      broadcastToAll("Above Max allowed!", {1,1,1})
    end
  elseif statNames[id] ~= nil then
    self.UI.setAttribute(id, "active", false)
    self.UI.setAttribute("statePanel", "width", tonumber(self.UI.getAttribute("statePanel", "width")-300))
    statNames[id] = false
  else
    if id == "add" then health.value = health.value + options.incrementBy
    elseif id == "addS" then mana.value = mana.value + options.incrementBy
    elseif id == "addE" then extra.value = extra.value + options.incrementBy
    elseif id == "sub" then health.value = health.value - options.incrementBy
    elseif id == "subS" then mana.value = mana.value - options.incrementBy
    elseif id == "subE" then extra.value = extra.value - options.incrementBy
    elseif id == "addMax" then health.value = health.value + options.incrementBy
      health.max = health.max + options.incrementBy
    elseif id == "addMaxS" then mana.value = mana.value + options.incrementBy
      mana.max = mana.max + options.incrementBy
    elseif id == "addMaxE" then extra.value = extra.value + options.incrementBy
      extra.max = extra.max + options.incrementBy
    elseif id == "subMax" then health.value = health.value - options.incrementBy
      health.max = health.max - options.incrementBy
    elseif id == "subMaxS" then mana.value = mana.value - options.incrementBy
      mana.max = mana.max - options.incrementBy
    elseif id == "subMaxE" then extra.value = extra.value - options.incrementBy
      extra.max = extra.max - options.incrementBy
    end
    if health.value > health.max and not options.aboveMax then health.value = health.max end
    if health.value < 0 and not options.belowZero then health.value = 0 end
    if mana.value > mana.max and not options.aboveMax then mana.value = mana.max end
    if mana.value < 0 and not options.belowZero then mana.value = 0 end
    if extra.value > extra.max and not options.aboveMax then extra.value = extra.max end
    if extra.value < 0 and not options.belowZero then extra.value = 0 end
    self.UI.setAttribute("progressBar", "percentage", health.value / health.max * 100)
    self.UI.setAttribute("progressBarS", "percentage", mana.value / mana.max * 100)
    self.UI.setAttribute("extraProgress", "percentage", extra.value / extra.max * 100)
    self.UI.setAttribute("hpText", "text", health.value .. "/" .. health.max)
    self.UI.setAttribute("manaText", "text", mana.value .. "/" .. mana.max)
    self.UI.setAttribute("extraText", "text", extra.value .. "/" .. extra.max)
    if options.HP2Desc then
      self.setDescription(health.value .. "/" .. health.max)
    end
  end
  self.UI.setAttribute("hpText", "textColor", "#FFFFFF")
  self.UI.setAttribute("manaText", "textColor", "#FFFFFF")
end

function onCollisionEnter(a)
  local newState = a.collision_object.getName()
  if statNames[newState] ~= nil then
    statNames[newState] = true
    a.collision_object.destruct()
    self.UI.setAttribute(newState, "active", true)
    Wait.frames(function() self.UI.setAttribute("statePanel", "width", getStatsCount()*300) end, 1)
  end
end

function getStatsCount()
  local count = 0
  for i,j in pairs(statNames) do
    if self.UI.getAttribute(i, "active") == "True" or self.UI.getAttribute(i, "active") == "true" then
      count = count + 1
    end
  end
  return count
end
