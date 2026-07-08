--[[Revised 5 March 2023--]]

--[[START USER SERVICABLE PARTS--]]

--[[IF YOU DISAGREE WITH THE ALGORITHMS,--]]
--[[THESE FUNCTIONS CAN BE TWEAKED--]]
--[[TO TASTE IN YOUR SAVE GAME FILE--]]

function moveResult()
    --[[the odds of the various MOVE results--]]
    --[[CONFIRMED BY DISASSEMBLY OF ROM DUMP OF TMS-1400 CHIP FULL CERTANITY--]]
    --[[ Special thanks to Ratsputin at https://github.com/ratsputin/Dark-Tower --]]
    local roll = math.random(1,16)
    local results = {'lost','lost','lost','dragon','dragon','plague','plague','plague','battle','battle','battle','safe','safe','safe','safe','safe'}
    return results[roll]
end

function tombruinResult()
    --[[the odds of finding something in a TOMB or RUIN--]]
    --[[CONFIRMED BY DISASSEMBLY OF ROM DUMP OF TMS-1400 CHIP FULL CERTANITY--]]
    local roll = math.random(1,16)
    local results = {'empty','empty','battle','battle','battle','battle','battle','battle','battle','battle','treasure','treasure','treasure','treasure','treasure','treasure'}
    return results[roll]
end

function startingBrigands(yourWarriors)
    --[[how many brigands you face at the beginning of battle--]]
    --[[equals the player's warrior count -2 through warrior count +2--]]
    --[[CONFIRMED BY BRUTE FORCE TESTING IN MAME EMULATION HIGH CERTANITY--]]
    local firstBrigands = yourWarriors + math.random(-2,2)
    if firstBrigands < 1 then firstBrigands = 1 end
    return firstBrigands
end

function oddsOfVictory(yourWarriors,theirBrigands)
    --[[Both sides roll d4 and multiply by army size--]]
    --[[Largest number wins, ties go to Warriors--]]
    --[[CONFIRMED BY DISASSEMBLY OF ROM DUMP OF TMS-1400 CHIP FULL CERTANITY--]]
    wd4 = math.random(1,4)
    bd4 = math.random(1,4)
    if (yourWarriors * wd4) >= (theirBrigands * bd4) then
        return 'warriors'
    else
        return 'brigands'
    end
end

function anyTreasure()
    --[[There was never a chance of getting nothing. Always return OK--]]
    --[[CONFIRMED BY DISASSEMBLY OF ROM DUMP OF TMS-1400 CHIP FULL CERTANITY--]]
    --[[Old code of 5% empty hands remains redacted if you want to make it harder on yourself--]]
    --[[local roll = math.random(1,20) \n if roll == 1 then return 'nope' else return 'ok' end --]]
    return 'ok'
end

function goldAward()
    --[[amount of gold awarded as treasure--]]
    --[[random amount between 13-20 bags of gold--]]
    --[[CONFIRMED BY DISASSEMBLY OF ROM DUMP OF TMS-1400 CHIP FULL CERTANITY--]]
    return math.random(13,20)
end

function itemAward()
    --[[chance of an extra treasure item--]]
    --[[CONFIRMED BY DISASSEMBLY OF ROM DUMP OF TMS-1400 CHIP FULL CERTANITY--]]
    local roll = math.random(1,16)
    local results = {'key','key','key','key','key','key','key','key','key','key','sword','pegasus','wizard','nope','nope','nope'}
    return results[roll]
end

function haggle()
    --[[rulebook states "approximately a 50/50 chance of lowering the stated price..."--]]
    --[[first haggle is 0-11 out of 16, every haggle thereafter is 50/50--]]
    --[[CONFIRMED BY DISASSEMBLY OF ROM DUMP OF TMS-1400 CHIP FULL CERTANITY--]]
    local roll = math.random(1,16)
    local results = {}
    if haggleFlag == 0 then
        results = {'deal','deal','deal','deal','deal','deal','deal','deal','deal','deal','deal','deal','closed','closed','closed','closed'}
    else
        results = {'deal','deal','deal','deal','deal','deal','deal','deal','closed','closed','closed','closed','closed','closed','closed','closed'}
    end
    haggleFlag = 1
    return results[roll]
end

function finalScore(movesItTook)
    --[[final score is (176+(starting tower brigands × 1.25)) - ((turns + starting tower warriors)×4)--]]
    --[[CONFIRMED BY DISASSEMBLY OF ROM DUMP OF TMS-1400 CHIP HIGH CERTANITY--]]
    final = (176+math.floor(dtBrigands * 1.25)) - ((movesItTook + undoInventory.warriors)*4)
    if final > 99 then final = 99 end
    if final < 0 then final = 0 end
    return final
end

--[[END USER SERVICABLE PARTS--]]




function onload()
    testing='no'
    math.randomseed(os.time())
    init()
end
function update()
    --[[test for seating changes--]]
    if testing ~= 'yes' then
        if seating[1] ~= Player['Red'].steam_id
        or seating[2] ~= Player['Blue'].steam_id
        or seating[3] ~= Player['Yellow'].steam_id
        or seating[4] ~= Player['Green'].steam_id then
            setCards()
            seating = {Player['Red'].steam_id,Player['Blue'].steam_id,Player['Yellow'].steam_id,Player['Green'].steam_id}
        end
    end
end




function init()
    --[[setup Dark Tower buttons--]]
    moveB_param     = {click_function = 'moveClick',    label = '', position = {4.3,2.68,0},width = 510,height = 510,font_size = 10,rotation = {0,0,90}}
    tombB_param     = {click_function = 'tombClick',    label = '', position = {4.3,2.68,1.1},width = 510,height = 510,font_size = 10,rotation = {0,0,90}}
    citadelB_param  = {click_function = 'citadelClick', label = '', position = {4.3,2.68,-1.1},width = 510,height = 510,font_size = 10,rotation = {0,0,90}}
    bazaarB_param   = {click_function = 'bazaarClick',  label = '', position = {4.3,3.78,0},width = 510,height = 510,font_size = 10,rotation = {0,0,90}}
    haggleB_param   = {click_function = 'haggleClick',  label = '', position = {4.3,3.78,1.1},width = 510,height = 510,font_size = 10,rotation = {0,0,90}}
    clearB_param    = {click_function = 'clearClick',   label = '', position = {4.3,3.78,-1.1},width = 510,height = 510,font_size = 10,rotation = {0,0,90}}
    repeatB_param   = {click_function = 'repeatClick',  label = '', position = {4.3,4.88,0},width = 510,height = 510,font_size = 10,rotation = {0,0,90}}
    yesB_param      = {click_function = 'yesClick',     label = '', position = {4.3,4.88,1.1},width = 510,height = 510,font_size = 10,rotation = {0,0,90}}
    noB_param       = {click_function = 'noClick',      label = '', position = {4.3,4.88,-1.1},width = 510,height = 510,font_size = 10,rotation = {0,0,90}}
    frontierB_param = {click_function = 'frontierClick',label = '', position = {4.3,1.58,0},width = 510,height = 510,font_size = 10,rotation = {0,0,90}}
    towerB_param    = {click_function = 'towerClick',   label = '', position = {4.3,1.58,1.1},width = 510,height = 510,font_size = 10,rotation = {0,0,90}}
    invB_param      = {click_function = 'inventoryClick',label = '',position = {4.3,1.58,-1.1},width = 510,height = 510,font_size = 10,rotation = {0,0,90}}

    pegasusR = {click_function = 'usePegasusR',label = 'PEGASUS',color = {0,0,0},width = 1700,height = 1700,font_size = 10,rotation = {0,0,0}}
    pegasusG = {click_function = 'usePegasusG',label = 'PEGASUS',color = {0,0,0},position = {0,0,0},width = 1700,height = 1700,font_size = 10,rotation = {0,0,0}}
    pegasusY = {click_function = 'usePegasusY',label = 'PEGASUS',color = {0,0,0},position = {0,0,0},width = 1700,height = 1700,font_size = 10,rotation = {0,0,0}}
    pegasusB = {click_function = 'usePegasusB',label = 'PEGASUS',color = {0,0,0},position = {0,0,0},width = 1700,height = 1700,font_size = 10,rotation = {0,0,0}}

    playerr_inv = {warriors=10,gold=30,food=25,scout=0,beast=0,healer=0,cursed=0,brassk=0,silverk=0,goldk=0,quad=0,sword=0,pegasus=0,citadel=0,moves=0}
    playerb_inv = {warriors=10,gold=30,food=25,scout=0,beast=0,healer=0,cursed=0,brassk=0,silverk=0,goldk=0,quad=0,sword=0,pegasus=0,citadel=0,moves=0}
    playery_inv = {warriors=10,gold=30,food=25,scout=0,beast=0,healer=0,cursed=0,brassk=0,silverk=0,goldk=0,quad=0,sword=0,pegasus=0,citadel=0,moves=0}
    playerg_inv = {warriors=10,gold=30,food=25,scout=0,beast=0,healer=0,cursed=0,brassk=0,silverk=0,goldk=0,quad=0,sword=0,pegasus=0,citadel=0,moves=0}
    inventory = {playerr_inv,playerb_inv,playery_inv,playerg_inv}
    undoInventory = {}

    if testing == 'yes' then
        inventory[1].warriors = 1
        inventory[2].warriors = 1
        inventory[3].warriors = 1
        inventory[4].warriors = 1
    end

    playerColors = {'R','B','Y','G'}
    playerCrayola = {'Red','Blue','Yellow','Green'}

    wedgeReels = {
        cursed=4,lost=4,plague=4,
        victory=5,warriors=5,brigands=5,
        wizard=6,closed=6,missing=6,
        dragon=7,sword=7,pegasus=7,
        brasskey=8,silverkey=8,goldkey=8,
        scout=9,healer=9,gold=9,
        warrior=10,food=10,beast=10,
        off=3
    }
    wedgeLights = {
        cursed=0,lost=1,plague=2,
        victory=0,warriors=1,brigands=2,
        dragon=0,sword=1,pegasus=2,
        brasskey=0,silverkey=1,goldkey=2,
        wizard=0,closed=1,missing=2,
        scout=0,healer=1,gold=2,
        warrior=0,food=1,beast=2,
        top=0,middle=1,bottom=2,
        off=0
    }

    riddles = {
        {'goldkey','silverkey'},{'goldkey','brasskey'},
        {'silverkey','goldkey'},{'silverkey','brasskey'},
        {'brasskey','silverkey'},{'brasskey','goldkey'}
    }

    --[[initialize globals--]]
    tokenX = 0
    tokenZ = 0
    scouted = 0
    flew = 0
    oldPhase=''
    referringFunction = ''
    grindingFunction = ''
    repeatFunction = ''
    foodStatus = ''
    level = 1
    player = 0
    brigands = 0
    haggleFlag = 0
    bailed = 'no'
    battleResult = ''
    dtBrigands = 0
    dtKey = 'goldkey'
    currentKey = 'yes'
    riddlePhase = 0
    towerAngles = {0,90,180,270}
    currentReel=123
    warriorPrice = 0
    foodPrice = 1
    beastPrice = 0
    scoutPrice = 0
    healerPrice = 0
    buying = 0
    buildings = 'real'
    blindfold = 'off'
    dragonWarriors = 2
    dragonGold = 6
    t100 = 0
    victim = 0
    curseWarriors = 0
    curseGold = 0
    treasureGold = 0
    player1 = 0
    totalMoves = 0
    treasureItem = 'none'
    repeat1pic=''
    repeat2pic=''
    repeat3pic=''
    repeat1lcd=''
    repeat2lcd=''
    repeat3lcd=''
    colorCodes =    {red={0.835,0,0},blue={0,0.1725,1},yellow={0.98,0.71,0.075},green={0,0.7,0.01},
                     brown={0.26,0.1725,0.14},gray={0.31,0.3,0.28},gold={0.86,0.49,0},tan={0.635,0.57,0.49}}
    dimmed = {0.2,0.2,0.2}

    --[[identify objects--]]
    soundboard  = getObjectFromGUID('d81685')
    towerOBJ    = getObjectFromGUID('5388d1')
    wedge       = getObjectFromGUID('2800df')
    shield      = getObjectFromGUID('623098')
    seating = {Player['Red'].steam_id,Player['Blue'].steam_id,Player['Yellow'].steam_id,Player['Green'].steam_id}
    tokens = {getObjectFromGUID('435f7c'),getObjectFromGUID('64a286'),getObjectFromGUID('fc68f8'),getObjectFromGUID('8c047a')}

    --[[set visibility variables--]]
    invisibleToAll = {"Black","White","Grey","Red","Yellow","Green","Blue"}
    visibleToAll = {"Pink"}
    visibleRed = {"White","Grey","Black","Red"}
    visibleBlue = {"White","Grey","Black","Blue"}
    visibleYellow = {"White","Grey","Black","Yellow"}
    visibleGreen = {"White","Grey","Black","Green"}
    visibleWho = {visibleRed,visibleBlue,visibleYellow,visibleGreen}

    --[[Set up banners--]]
    redBanner = getObjectFromGUID('228548')
    blueBanner = getObjectFromGUID('fd7902')
    greenBanner = getObjectFromGUID('125544')
    yellowBanner = getObjectFromGUID('447c05')
    banners = {redBanner,blueBanner,yellowBanner,greenBanner}

    for c=1,4,1 do
        banners[c].setInvisibleTo(invisibleToAll)
    end

    --[[Set up scorecards--]]
    scorecardBodies = {getObjectFromGUID('2cff6a'),getObjectFromGUID('072995'),getObjectFromGUID('a1bee5'),getObjectFromGUID('ba0e2c')}
    card_arisilon = {
        warriors = getObjectFromGUID('fbe4dc'),
        gold = getObjectFromGUID('88e49a'),
        food = getObjectFromGUID('4a6c7a'),
        beast = getObjectFromGUID('9b165f'),
        scout = getObjectFromGUID('aaf953'),
        healer = getObjectFromGUID('25f974'),
        sword = getObjectFromGUID('2a9d71'),
        pegasus = getObjectFromGUID('c37116'),
        brassk = getObjectFromGUID('b9c2ae'),
        silverk = getObjectFromGUID('284e43'),
        goldk = getObjectFromGUID('161cec')
    }
    card_zenon = {
        warriors = getObjectFromGUID('103c64'),
        gold = getObjectFromGUID('1cadb0'),
        food = getObjectFromGUID('71f553'),
        beast = getObjectFromGUID('36750f'),
        scout = getObjectFromGUID('c9459a'),
        healer = getObjectFromGUID('9ca295'),
        sword = getObjectFromGUID('26f7e0'),
        pegasus = getObjectFromGUID('df3570'),
        brassk = getObjectFromGUID('c08d4a'),
        silverk = getObjectFromGUID('a0379e'),
        goldk = getObjectFromGUID('9ab0a5')
    }
    card_durnin = {
        warriors = getObjectFromGUID('4f5733'),
        gold = getObjectFromGUID('eb8f0e'),
        food = getObjectFromGUID('23daa1'),
        beast = getObjectFromGUID('1916a0'),
        scout = getObjectFromGUID('f97365'),
        healer = getObjectFromGUID('d5f3b0'),
        sword = getObjectFromGUID('951ac2'),
        pegasus = getObjectFromGUID('078c67'),
        brassk = getObjectFromGUID('66bcfa'),
        silverk = getObjectFromGUID('c693d9'),
        goldk = getObjectFromGUID('4d2bc7')
    }
    card_brynthia = {
        warriors = getObjectFromGUID('058a1d'),
        gold = getObjectFromGUID('401166'),
        food = getObjectFromGUID('d080e8'),
        beast = getObjectFromGUID('c4ffc4'),
        scout = getObjectFromGUID('a4c2eb'),
        healer = getObjectFromGUID('91472d'),
        sword = getObjectFromGUID('14adbb'),
        pegasus = getObjectFromGUID('0a1196'),
        brassk = getObjectFromGUID('60fb04'),
        silverk = getObjectFromGUID('a09666'),
        goldk = getObjectFromGUID('cd17a3')
    }
    scorecards = {card_arisilon,card_brynthia,card_durnin,card_zenon}
    setCards()
    getObjectFromGUID('c37116').createButton(pegasusR)
    getObjectFromGUID('df3570').createButton(pegasusG)
    getObjectFromGUID('078c67').createButton(pegasusY)
    getObjectFromGUID('0a1196').createButton(pegasusB)

    --[[Set up LCD arrays--]]
    unity_lcd_10 = getObjectFromGUID('422b16')
    unity_lcd_01 = getObjectFromGUID('5f6229')
    unity_lcd_triggers =    {['0']=0,['1']=1,['2']=2,['3']=3,['4']=4,['5']=5,['6']=6,['7']=7,['8']=8,['9']=9,
                            ['']=10,[' ']=10,['-']=13,['C']=11,['L']=12,['R']= 14,['G']= 15,['Y']= 16,['B']= 17}
    blinxBox = getObjectFromGUID('5b73c5')
    blinxBox.AssetBundle.playLoopingEffect(0)

    --[[prevent interactibility with locked objects--]]


    redBanner.interactable = false
    blueBanner.interactable = false
    greenBanner.interactable = false
    yellowBanner.interactable = false
    soundboard.interactable = false
    blinxBox.interactable = false
    unity_lcd_10.interactable = false
    unity_lcd_01.interactable = false
    wedge.interactable = false
    shield.interactable = false


    --[[prevent interactibility with objects that can harm scorecards--]]
    --[[DOES NOT ALLOW FOR HOVERING OVER CARDS FOR SCORE; FOR FUTURE USE--]]
    --[[
    for c=1,4,1 do
        card = scorecards[c]
        scorecards[c].warriors.interactable = false
        scorecards[c].gold.interactable = false
        scorecards[c].food.interactable = false
        scorecards[c].beast.interactable = false
        scorecards[c].scout.interactable = false
        scorecards[c].healer.interactable = false
        scorecards[c].sword.interactable = false
        scorecards[c].pegasus.interactable = false
        scorecards[c].brassk.interactable = false
        scorecards[c].silverk.interactable = false
        scorecards[c].goldk.interactable = false

    end
    --]]


    shield.setInvisibleTo(invisibleToAll)

    --[[extend table outwards--]]
    getObjectFromGUID("1d6145").interactable = false
    getObjectFromGUID("1d6145").attachInvisibleHider("hideTable", true)


    --[[apply Dark Tower buttons--]]
    towerOBJ.createButton(moveB_param)
    towerOBJ.createButton(tombB_param)
    towerOBJ.createButton(citadelB_param)
    towerOBJ.createButton(bazaarB_param)
    towerOBJ.createButton(haggleB_param)
    towerOBJ.createButton(clearB_param)
    towerOBJ.createButton(repeatB_param)
    towerOBJ.createButton(yesB_param)
    towerOBJ.createButton(noB_param)
    towerOBJ.createButton(towerB_param)
    towerOBJ.createButton(frontierB_param)
    towerOBJ.createButton(invB_param)

    --[[ask player to choose level--]]
    changeLCD('L1')
    throbbit('on')
    changePhase('chooseLevel')
end


function countPlayers()
    local p = 0
    if Player['Red'].seated then p = p + 1 end
    if Player['Blue'].seated then p = p + 1 end
    if Player['Yellow'].seated then p = p + 1 end
    if Player['Green'].seated then p = p + 1 end
    if testing=='yes' then return 4 else return p end
end


function showPic(pic)
    if pic == '' or pic == nil or pic == 'none' then
        wedge.AssetBundle.playTriggerEffect(3)
    else
        currentReel = wedgeReels[pic]
        wedge.AssetBundle.playTriggerEffect(wedgeReels[pic])
        wedge.AssetBundle.playTriggerEffect(wedgeLights[pic])
    end
end


function grind(pic)
    wedge.AssetBundle.playTriggerEffect(3)
    changeLCD('  ')
    soundboard.AssetBundle.playTriggerEffect(16)
    currentReel = wedgeReels[pic]
    Timer.create({identifier="grindTimer",function_name=grindingFunction,delay=1.5,repetitions=1})
end


function maxGold(p)
    --[[check for encumbrance!--]]
    if inventory[player].gold > 99 then inventory[player].gold = 99 end
    m = (inventory[player].warriors * 6) + (inventory[player].beast * 50)
    if inventory[player].gold > m then
        inventory[player].gold = m
        scorecards[player].gold.setName(inventory[player].gold .. ' GOLD')
    end
end


function setCards()
    for c=1,4,1 do
        card = scorecards[c]
        fullCol = playerCrayola[c]
        if Player[fullCol].seated == true or testing=='yes' then
            scorecardBodies[c].setColorTint({1,1,1})
            banners[c].setInvisibleTo(visibleToAll)
            scorecards[c].warriors.setColorTint({1,1,1})
            if inventory[c].warriors == 1 then
                scorecards[c].warriors.setName('1 WARRIOR')
            else
                scorecards[c].warriors.setName(inventory[c].warriors .. ' WARRIORS')
            end
            scorecards[c].gold.setColorTint({1,1,1})
            scorecards[c].gold.setName(inventory[c].gold .. ' GOLD')
            scorecards[c].food.setColorTint({1,1,1})
            scorecards[c].food.setName(inventory[c].food .. ' FOOD')
            if inventory[c].beast > 0 then
                scorecards[c].beast.setColorTint({1,1,1})
                scorecards[c].beast.setName('BEAST')
            else
                scorecards[c].beast.setColorTint(dimmed)
                scorecards[c].beast.setName('')
            end
            if inventory[c].scout > 0 then
                scorecards[c].scout.setColorTint({1,1,1})
                scorecards[c].scout.setName('SCOUT')
            else
                scorecards[c].scout.setColorTint(dimmed)
                scorecards[c].scout.setName('')
            end
            if inventory[c].healer > 0 then
                scorecards[c].healer.setColorTint({1,1,1})
                scorecards[c].healer.setName('HEALER')
            else
                scorecards[c].healer.setColorTint(dimmed)
                scorecards[c].healer.setName('')
            end
            if inventory[c].sword > 0 then
                scorecards[c].sword.setColorTint({1,1,1})
                scorecards[c].sword.setName('SWORD')
            else
                scorecards[c].sword.setColorTint(dimmed)
                scorecards[c].sword.setName('')
            end
            if inventory[c].pegasus > 0 then
                scorecards[c].pegasus.setColorTint({1,1,1})
                scorecards[c].pegasus.setName('PEGASUS')
            else
                scorecards[c].pegasus.setColorTint(dimmed)
                scorecards[c].pegasus.setName('')
            end
            if inventory[c].brassk > 0 then
                scorecards[c].brassk.setColorTint({1,1,1})
                scorecards[c].brassk.setName('BRASS KEY')
            else
                scorecards[c].brassk.setColorTint(dimmed)
                scorecards[c].brassk.setName('')
            end
            if inventory[c].silverk > 0 then
                scorecards[c].silverk.setColorTint({1,1,1})
                scorecards[c].silverk.setName('SILVER KEY')
            else
                scorecards[c].silverk.setColorTint(dimmed)
                scorecards[c].silverk.setName('')
            end
            if inventory[c].goldk > 0 then
                scorecards[c].goldk.setColorTint({1,1,1})
                scorecards[c].goldk.setName('GOLD KEY')
            else
                scorecards[c].goldk.setColorTint(dimmed)
                scorecards[c].goldk.setName('')
            end
        else
            scorecardBodies[c].setColorTint(dimmed)
            banners[c].setInvisibleTo(invisibleToAll)
            scorecards[c].warriors.setColorTint(dimmed)
            scorecards[c].warriors.setName('')
            scorecards[c].gold.setColorTint(dimmed)
            scorecards[c].gold.setName('')
            scorecards[c].food.setColorTint(dimmed)
            scorecards[c].food.setName('')
            scorecards[c].beast.setColorTint(dimmed)
            scorecards[c].beast.setName('')
            scorecards[c].scout.setColorTint(dimmed)
            scorecards[c].scout.setName('')
            scorecards[c].healer.setColorTint(dimmed)
            scorecards[c].healer.setName('')
            scorecards[c].sword.setColorTint(dimmed)
            scorecards[c].sword.setName('')
            scorecards[c].pegasus.setColorTint(dimmed)
            scorecards[c].pegasus.setName('')
            scorecards[c].brassk.setColorTint(dimmed)
            scorecards[c].brassk.setName('')
            scorecards[c].silverk.setColorTint(dimmed)
            scorecards[c].silverk.setName('')
            scorecards[c].goldk.setColorTint(dimmed)
            scorecards[c].goldk.setName('')
        end
    end
end


function playTurn()
    totalMoves = totalMoves + 1
    throbbit('on')
    foodStatus = 'check'
    repeatFunction = ''
    repeat1pic=''
    repeat2pic=''
    repeat3pic=''
    repeat1lcd=''
    repeat2lcd=''
    repeat3lcd=''
    changePhase('startTurnWait')
    Timer.destroy("startGame")
    if scouted == 1 then
        scouted = 0
        foodStatus = 'scout'
    elseif flew == 1 then
        flew = 0
    else
        foundPlayer = 0
        while foundPlayer == 0 do
            player = player + 1
            if player == 5 then player = 1 end
            if Player[playerCrayola[player]].seated == true then foundPlayer = 1 end
            if testing == 'yes' then foundPlayer = 1 end
        end
    end
    if totalMoves == 1 then player = player1 end
    changeLCD(' ' .. playerColors[player])
    showPic('')
    setUpUndo()
    if blindfold == 'on' then
        shield.setInvisibleTo(visibleWho[player])
    else
        shield.setInvisibleTo(invisibleToAll)
    end
    self.UI.setAttribute("UICircuit", "visibility", playerCrayola[player])
    tl = tokens[player].getPosition()
    haggleFlag = 0
    tokenX = tl['x']
    tokenZ = tl['z']
end


function endTurn()
    Timer.destroy('endTimer')
    maxGold(player)
    throbbit('on')
    changePhase('endTurnWait')
    changeLCD('-' .. playerColors[player])
    showPic('')
    if testing == 'yes' then print('MOVES: ' .. inventory[player].moves) end
end


function changePhase(phase)
    gamePhase = phase
    if testing == 'yes' then print('Game Phase: '..gamePhase) end
end


--[[LCD FUNCTIONS--]]
function changeLCD(value)
    value = '' .. value
    if(string.len(value) == 1) then
        value = '0'..value
    end
    firstDigit = string.sub(value,1,1)
    lastDigit  = string.sub(value,2,2)
    unity_lcd_10.AssetBundle.playTriggerEffect(unity_lcd_triggers[firstDigit])
    unity_lcd_01.AssetBundle.playTriggerEffect(unity_lcd_triggers[lastDigit])
end
function throbbit(flip)
    if flip=='off' then
        blinxBox.AssetBundle.playTriggerEffect(1)
        blinxBox.AssetBundle.playLoopingEffect(0)
    else
        blinxBox.AssetBundle.playTriggerEffect(0)
        blinxBox.AssetBundle.playLoopingEffect(0)
    end

end


function setUpUndo()
    undoInventory.warriors = inventory[player].warriors
    undoInventory.gold = inventory[player].gold
    undoInventory.food = inventory[player].food
    undoInventory.scout = inventory[player].scout
    undoInventory.beast = inventory[player].beast
    undoInventory.healer = inventory[player].healer
    undoInventory.cursed = inventory[player].cursed
    undoInventory.brassk = inventory[player].brassk
    undoInventory.silverk = inventory[player].silverk
    undoInventory.goldk = inventory[player].goldk
    undoInventory.quad = inventory[player].quad
    undoInventory.sword = inventory[player].sword
    undoInventory.pegasus = inventory[player].pegasus
end


function needsFood()
    if inventory[player].cursed == 1 then
        changePhase('cursed')
        throbbit('off')
        iGotCursed()
    end
    oldPhase = gamePhase
    changePhase('starvation')
    eats = math.ceil(inventory[player].warriors/15)
    inventory[player].food = inventory[player].food - eats
    if inventory[player].food < 0 then inventory[player].food = 0 end
    scorecards[player].food.setName(inventory[player].food .. ' FOOD')
    foodStatus = 'checked'
    Timer.destroy('foodChecker2')
    if inventory[player].food == 0 then
        --[[starved--]]
        changeLCD('  ')
        soundboard.AssetBundle.playTriggerEffect(8)
        inventory[player].warriors = inventory[player].warriors - 1
        maxGold(player)
        if inventory[player].warriors < 1 and countPlayers() > 1 then inventory[player].warriors = 1 end
        if inventory[player].warriors == 1 then
            scorecards[player].warriors.setName('1 WARRIOR')
        else
            scorecards[player].warriors.setName(inventory[player].warriors .. ' WARRIORS')
        end
        Timer.create({identifier="foodChecker2",function_name='foodDirect',delay=3.5,repetitions=1})
    elseif inventory[player].food <= eats * 4 then
        --[[hungry--]]
        changeLCD('  ')
        soundboard.AssetBundle.playTriggerEffect(18)
        Timer.create({identifier="foodChecker2",function_name='foodDirect',delay=2.5,repetitions=1})
    else
        --[[healthy--; send back to referring function]]
        Timer.create({identifier="foodChecker2",function_name='foodDirect',delay=0,repetitions=1})
    end
end
function foodDirect()
    Timer.destroy('foodChecker2')
    changePhase(oldPhase)
    if inventory[player].warriors == 0 then
        showScore()
    else
        Timer.create({identifier="foodChecker",function_name=referringFunction,delay=0,repetitions=1})
    end
end


--[[pegasus buttons--]]
function usePegasusR()
    if player==1 and inventory[player].pegasus == 1 then usePegasus() end
end
function usePegasusB()
    if player==2 and inventory[player].pegasus == 1 then usePegasus() end
end
function usePegasusY()
    if player==3 and inventory[player].pegasus == 1 then usePegasus() end
end
function usePegasusG()
    if player==4 and inventory[player].pegasus == 1 then usePegasus() end
end
function usePegasus()
    if gamePhase == 'startTurnWait' then
        --[[Player legally using PEGASUS--]]
        Timer.destroy('grindTimer')
        if currentReel ~= wedgeReels['pegasus'] then
            changePhase('pegasusWait')
            grindingFunction = 'usePegasus1'
            grind('pegasus')
        else
            changePhase('pegasusWait')
            usePegasus1()
        end
    end
end
function usePegasus1()
    showPic('pegasus')
    soundboard.AssetBundle.playTriggerEffect(15)
    broadcastToAll( 'Press YES to confirm use of Pegasus, or press NO to cancel.', {1,1,1} )
    Timer.create({identifier="pegasusTimer1",function_name='pegasusWait',delay=2,repetitions=0})
end
function pegasusWait()
    Timer.destroy('pegasusTimer1')
    changePhase('pegasus')
end


--[[panel buttons--]]
function yesClick()
    if gamePhase == 'chooseLevel' and countPlayers() == 0 then
        broadcastToAll( 'Game cannot begin until at least one player is seated.', {1,1,1} )
    elseif gamePhase == 'chooseLevel' and countPlayers() > 0 then
        broadcastToAll( 'Choose which player (R, B, Y, or G) goes first.', {1,1,1} )
        changePhase('choosePlayer1')
        choosePlayer1()
    elseif gamePhase == 'choosePlayer1' then
        referringFunction = 'yesClick'
        showPic()
        changeLCD('  ')
        soundboard.AssetBundle.playTriggerEffect(14)
        changePhase('start1812')
        if level==1 then
            dtBrigands = math.random(17,32)
        elseif level==2 then
            dtBrigands = math.random(33,64)
        elseif level==3 then
            dtBrigands = math.random(17,64)
        else
            dtBrigands = 16
            playerr_inv = {warriors=10,gold=30,food=25,scout=1,beast=1,healer=1,cursed=0,brassk=1,silverk=1,goldk=1,quad=4,sword=1,pegasus=0,citadel=0,moves=0}
            playerg_inv = {warriors=10,gold=30,food=25,scout=1,beast=1,healer=1,cursed=0,brassk=1,silverk=1,goldk=1,quad=4,sword=1,pegasus=0,citadel=0,moves=0}
            playery_inv = {warriors=10,gold=30,food=25,scout=1,beast=1,healer=1,cursed=0,brassk=1,silverk=1,goldk=1,quad=4,sword=1,pegasus=0,citadel=0,moves=0}
            playerb_inv = {warriors=10,gold=30,food=25,scout=1,beast=1,healer=1,cursed=0,brassk=1,silverk=1,goldk=1,quad=4,sword=1,pegasus=0,citadel=0,moves=0}
            inventory = {playerr_inv,playerg_inv,playery_inv,playerb_inv}
            setCards()
        end
        if testing=='yes' then dtBrigands = 1 end
        if level==4 then
            riddle = {riddles[1],riddles[1],riddles[1],riddles[1]}
        else
            theriddle = riddles[math.random(1,6)]
            riddle = {theriddle,theriddle,theriddle,theriddle}
        end
        Timer.create({
            identifier="startGame",
            function_name='playTurn',
            delay=5.5,
            repetitions=1
        })
    elseif gamePhase == 'showScore' then
        init()
    elseif gamePhase == 'pegasus' then
        inventory[player].pegasus = 0
        scorecards[player].pegasus.setColorTint(dimmed)
        scorecards[player].pegasus.setName('')
        flew = 1
        soundboard.AssetBundle.playTriggerEffect(9)
        playTurn()
    elseif gamePhase == 'bazaarWarrior' or gamePhase == 'buyingWarrior' then
        changePhase('buyingWarrior')
        buying = buying + 1
        if buying * warriorPrice > inventory[player].gold then
            bazaarClosed()
        else
            changeLCD(buying)
            soundboard.AssetBundle.playTriggerEffect(19)
        end
    elseif gamePhase == 'bazaarFood' or gamePhase == 'buyingFood' then
        changePhase('buyingFood')
        buying = buying + 1
        if buying > inventory[player].gold then
            bazaarClosed()
        else
            changeLCD(buying)
            soundboard.AssetBundle.playTriggerEffect(19)
        end
    elseif gamePhase == 'bazaarBeast' then
        changePhase('buyingBeast')
        if beastPrice > inventory[player].gold then
            bazaarClosed()
        else
            inventory[player].gold = inventory[player].gold - beastPrice
            scorecards[player].gold.setName(inventory[player].gold .. ' GOLD')
            inventory[player].beast = 1
            scorecards[player].beast.setColorTint({1,1,1})
            scorecards[player].beast.setName('BEAST')
            bought()
        end
    elseif gamePhase == 'bazaarScout' then
        changePhase('buyingScout')
        if scoutPrice > inventory[player].gold then
            bazaarClosed()
        else
            inventory[player].gold = inventory[player].gold - scoutPrice
            scorecards[player].gold.setName(inventory[player].gold .. ' GOLD')
            inventory[player].scout = 1
            scorecards[player].scout.setColorTint({1,1,1})
            scorecards[player].scout.setName('SCOUT')
            bought()
        end
    elseif gamePhase == 'bazaarHealer' then
        changePhase('buyingHealer')
        if healerPrice > inventory[player].gold then
            bazaarClosed()
        else
            inventory[player].gold = inventory[player].gold - healerPrice
            scorecards[player].gold.setName(inventory[player].gold .. ' GOLD')
            inventory[player].healer = 1
            scorecards[player].healer.setColorTint({1,1,1})
            scorecards[player].healer.setName('HEALER')
            bought()
        end
    elseif gamePhase == 'chooseCurse' then
        gamePhase = 'cursing'
        curseWarriors   = math.floor(inventory[victim].warriors / 4)
        curseGold       = math.floor(inventory[victim].gold / 4)
        curse()
    elseif gamePhase == 'riddleWait' then
        myRiddle = riddle[player]
        if myRiddle[riddlePhase] ~= dtKey then
            changeLCD('  ')
            showPic()
            changePhase('oopsriddle')
            soundboard.AssetBundle.playTriggerEffect(12)
            Timer.create({identifier="endTurn",function_name='endTurn',delay=2,repetitions=1})
        else
            if riddlePhase == 1 then
                riddlePhase = 2
                riddleOfTheKeys()
            else
                changePhase('toTowerBattle')
                changeLCD('  ')
                soundboard.AssetBundle.playTriggerEffect(2)
                battle()
            end
        end
    else
    end
end
function curse()
    Timer.destroy('grindTimer')
    if currentReel ~= wedgeReels['warriors'] then
        grindingFunction = 'curse'
        grind('warriors')
    else
        inventory[player].warriors = inventory[player].warriors + curseWarriors
        scorecards[player].warriors.setName(inventory[player].warriors .. ' WARRIORS')
        changeLCD(inventory[player].warriors)
        showPic('warriors')
        soundboard.AssetBundle.playTriggerEffect(0)
        repeat1lcd='inventory[player].warriors'
        repeat1pic='warriors'
        Timer.create({identifier='curseXGold',function_name='curseXGold',delay=1.5,repetitions=1})
    end
end
function curseXGold()
    Timer.destroy('curseXGold')
    Timer.destroy('grindTimer')
    if currentReel ~= wedgeReels['gold'] then
        grindingFunction = 'curseXGold'
        grind('gold')
    else
        inventory[player].gold = inventory[player].gold + curseGold
        maxGold(player)
        scorecards[player].gold.setName(inventory[player].gold .. ' GOLD')
        changeLCD(inventory[player].gold)
        showPic('gold')
        soundboard.AssetBundle.playTriggerEffect(0)
        repeat2lcd='inventory[player].gold'
        repeat2pic='gold'
        inventory[victim].cursed = 1
        Timer.create({identifier="endTurn",function_name='endTurn',delay=1.5,repetitions=1})
    end
end
function iGotCursed()
    throbbit('off')
    Timer.destroy('grindTimer')
    if currentReel ~= wedgeReels['cursed'] then
        grindingFunction = 'iGotCursed'
        grind('cursed')
    else
        changeLCD('  ')
        showPic('cursed')
        soundboard.AssetBundle.playTriggerEffect(8)
        tokens[player].setPositionSmooth({tokenX,4,tokenZ})
        Timer.create({identifier='sickWarriors',function_name='sickWarriors',delay=3.5,repetitions=1})
    end
end
function sickWarriors()
    Timer.destroy('grindTimer')
    if currentReel ~= wedgeReels['warriors'] then
        grindingFunction = 'sickWarriors'
        grind('warriors')
    else
        inventory[player].warriors = inventory[player].warriors - curseWarriors
        if inventory[player].warriors == 1 then
            scorecards[player].warriors.setName('1 WARRIOR')
        else
            scorecards[player].warriors.setName(inventory[player].warriors .. ' WARRIORS')
        end
        changeLCD(inventory[player].warriors)
        showPic('warriors')
        soundboard.AssetBundle.playTriggerEffect(0)
        Timer.create({identifier='sickGold',function_name='sickGold',delay=1.5,repetitions=1})
    end
end
function sickGold()
    Timer.destroy('grindTimer')
    if currentReel ~= wedgeReels['gold'] then
        grindingFunction = 'sickGold'
        grind('gold')
    else
        inventory[player].gold = inventory[player].gold - curseGold
        maxGold(player)
        scorecards[player].gold.setName(inventory[player].gold .. ' GOLD')
        changeLCD(inventory[player].gold)
        showPic('gold')
        soundboard.AssetBundle.playTriggerEffect(0)
        curseWarriors = 0
        curseGold = 0
        inventory[player].cursed = 0
        Timer.create({identifier='endTurn',function_name='endTurn',delay=1.5,repetitions=1})
    end
end


function noClick()
    if gamePhase == 'chooseLevel' then
        referringFunction = 'noClick'
        level = level + 1
        if level == 5 then level = 1 end
        changeLCD('L' .. level)
        soundboard.AssetBundle.playTriggerEffect(19)
    elseif gamePhase == 'choosePlayer1' then
        soundboard.AssetBundle.playTriggerEffect(19)
        choosePlayer1()
    elseif gamePhase == 'endTurnWait' then
        soundboard.AssetBundle.playTriggerEffect(9)
        playTurn()
    elseif gamePhase == 'showScore' then
        init()
    elseif gamePhase == 'pegasus' then
        soundboard.AssetBundle.playTriggerEffect(0)
        playTurn()
    elseif gamePhase == 'bazaarWarrior' then
        offerFood()
    elseif gamePhase == 'buyingWarrior' then
        inventory[player].gold = inventory[player].gold - (buying * warriorPrice)
        scorecards[player].gold.setName(inventory[player].gold .. ' GOLD')
        inventory[player].warriors = inventory[player].warriors + buying
        scorecards[player].warriors.setName(inventory[player].warriors .. ' WARRIORS')
        bought()
    elseif gamePhase == 'buyingFood' then
        inventory[player].gold = inventory[player].gold - buying
        scorecards[player].gold.setName(inventory[player].gold .. ' GOLD')
        inventory[player].food = inventory[player].food + buying
        scorecards[player].food.setName(inventory[player].food .. ' FOOD')
        bought()
    elseif gamePhase == 'bazaarFood' then
        if inventory[player].beast == 0 then
            offerBeast()
        elseif inventory[player].scout == 0 then
            offerScout()
        elseif inventory[player].healer ==0 then
            offerHealer()
        else
            offerWarrior()
        end
    elseif gamePhase == 'bazaarBeast' then
        if inventory[player].scout == 0 then
            offerScout()
        elseif inventory[player].healer ==0 then
            offerHealer()
        else
            offerWarrior()
        end
    elseif gamePhase == 'bazaarScout' then
        if inventory[player].healer ==0 then
            offerHealer()
        else
            offerWarrior()
        end
    elseif gamePhase == 'bazaarHealer' then
        offerWarrior()
    elseif gamePhase == 'tombBattle' then
        bailed = 'yes'
    elseif gamePhase == 'towerBattle' then
        bailed = 'yes'
    elseif gamePhase == 'chooseCurse' then
        soundboard.AssetBundle.playTriggerEffect(19)
        curseVictim()
    elseif gamePhase == 'riddleWait' then
        riddleOfTheKeys()
    else
    end
end
function curseVictim()
    --[[Revised August 2020]]
    victim = victim + 1
    if victim == 5 then victim = 1 end
    if victim == player then
        curseVictim()
    elseif Player[playerCrayola[victim]].seated ~= true then
        curseVictim()
    else
        changeLCD('C'..playerColors[victim])
    end
end
function choosePlayer1()
    player1 = player1 + 1
    if player1 == 5 then player1 = 1 end
    if Player[playerCrayola[player1]].seated ~= true then
        choosePlayer1()
    else
        changeLCD(playerColors[player1]..'1')
    end
end

function haggleClick()
    --[[PRICE FLOORS OF 1 CONFIRMED BY DISASSEMBLY OF ROM DUMP OF TMS-1400 CHIP FULL CERTANITY--]]
    local coinFlip = haggle()
    if gamePhase == 'bazaarFood' then
        bazaarClosed()
    elseif gamePhase == 'showScore' then
        init()
    elseif gamePhase == 'bazaarWarrior' then
        if warriorPrice == 1 or coinFlip == 'closed' then bazaarClosed()
        else
            warriorPrice = warriorPrice - 1
            offerWarrior()
        end
    elseif gamePhase == 'bazaarBeast' then
        if beastPrice == 1 or coinFlip == 'closed' then bazaarClosed()
        else
            beastPrice = beastPrice - 1
            offerBeast()
        end
    elseif gamePhase == 'bazaarScout' then
        if scoutPrice == 1 or coinFlip == 'closed' then bazaarClosed()
        else
            scoutPrice = scoutPrice - 1
            offerScout()
        end
    elseif gamePhase == 'bazaarHealer' then
        if healerPrice == 1 or coinFlip == 'closed' then bazaarClosed()
        else
            healerPrice = healerPrice - 1
            offerHealer()
        end
    else
        --[[toggle building colors--]]
        if buildings == 'real' then
            buildings = 'seats'
            getObjectFromGUID('a2efd5').setColorTint(colorCodes['red'])
            getObjectFromGUID('7f55b9').setColorTint(colorCodes['red'])
            getObjectFromGUID('fc0d02').setColorTint(colorCodes['red'])
            getObjectFromGUID('8bf590').setColorTint(colorCodes['red'])
            getObjectFromGUID('b1a7d2').setColorTint(colorCodes['blue'])
            getObjectFromGUID('7ee674').setColorTint(colorCodes['blue'])
            getObjectFromGUID('582c69').setColorTint(colorCodes['blue'])
            getObjectFromGUID('e5ad46').setColorTint(colorCodes['blue'])
            getObjectFromGUID('7ddda5').setColorTint(colorCodes['green'])
            getObjectFromGUID('98b270').setColorTint(colorCodes['green'])
            getObjectFromGUID('ef158a').setColorTint(colorCodes['green'])
            getObjectFromGUID('bcf3d7').setColorTint(colorCodes['green'])
            --[[tokens--]]
            if getObjectFromGUID('64a286') then getObjectFromGUID('64a286').setColorTint(colorCodes['blue']) end
            if getObjectFromGUID('8c047a') then getObjectFromGUID('8c047a').setColorTint(colorCodes['green']) end
            if getObjectFromGUID('435f7c') then getObjectFromGUID('435f7c').setColorTint(colorCodes['red']) end
        else
            buildings = 'real'
            getObjectFromGUID('a2efd5').setColorTint(colorCodes['brown'])
            getObjectFromGUID('7f55b9').setColorTint(colorCodes['brown'])
            getObjectFromGUID('fc0d02').setColorTint(colorCodes['brown'])
            getObjectFromGUID('8bf590').setColorTint(colorCodes['brown'])
            getObjectFromGUID('b1a7d2').setColorTint(colorCodes['gray'])
            getObjectFromGUID('7ee674').setColorTint(colorCodes['gray'])
            getObjectFromGUID('582c69').setColorTint(colorCodes['gray'])
            getObjectFromGUID('e5ad46').setColorTint(colorCodes['gray'])
            getObjectFromGUID('7ddda5').setColorTint(colorCodes['tan'])
            getObjectFromGUID('98b270').setColorTint(colorCodes['tan'])
            getObjectFromGUID('ef158a').setColorTint(colorCodes['tan'])
            getObjectFromGUID('bcf3d7').setColorTint(colorCodes['tan'])
            --[[tokens--]]
            if getObjectFromGUID('64a286') then getObjectFromGUID('64a286').setColorTint(colorCodes['gray']) end
            if getObjectFromGUID('8c047a') then getObjectFromGUID('8c047a').setColorTint(colorCodes['tan']) end
            if getObjectFromGUID('435f7c') then getObjectFromGUID('435f7c').setColorTint(colorCodes['brown']) end
        end
    end
end


function tombClick()
    if gamePhase == 'startTurnWait' then
        referringFunction = 'tombClick'
        if foodStatus == 'check' then
            needsFood()
        else
            changePhase('tombruin')
            bailed = 'no'
            throbbit('off')
            inventory[player].moves = inventory[player].moves + 1
            inventory[player].citadel = 0
            Timer.destroy('foodChecker')
            local whatsInside = tombruinResult()
            if whatsInside == 'treasure' then
                changeLCD('  ')
                showPic()
                soundboard.AssetBundle.playTriggerEffect(22)
                changePhase('freeTreasure')
                Timer.create({identifier="treasure",function_name='treasureOK',delay=4,repetitions=1})
            elseif whatsInside == 'empty' then
                changeLCD('  ')
                showPic()
                soundboard.AssetBundle.playTriggerEffect(22)
                Timer.create({identifier="tombEnd",function_name='tombEnd',delay=8.5,repetitions=1})
            else
                changeLCD('  ')
                showPic()
                soundboard.AssetBundle.playTriggerEffect(21)
                Timer.create({identifier="toBattle",function_name='battle',delay=3.5,repetitions=1})
            end
        end
    else
    end
end
function tombEnd()
    Timer.destroy('tombEnd')
    endTurn()
end
function battle()
    throbbit('off')
    Timer.destroy('toBattle')
    if gamePhase == 'tombruin' or gamePhase == 'move' then
        brigands = startingBrigands(inventory[player].warriors)
        changePhase('tombBattle')
        Timer.create({identifier="toBattle",function_name='oneBattle',delay=1.5,repetitions=1})
    elseif gamePhase == 'toTowerBattle' then
        brigands = dtBrigands
        changePhase('towerBattle')
        Timer.create({identifier="toBattle",function_name='oneBattle',delay=1.5,repetitions=1})
    else
    end
end
function oneBattle()
    Timer.destroy('grindTimer')
    if currentReel ~= wedgeReels['brigands'] then
        grindingFunction = 'oneBattle'
        grind('brigands')
    else
        Timer.destroy('toBattle')
        changeLCD(brigands)
        showPic('brigands')
        battleLoop = 0
        soundboard.AssetBundle.playTriggerEffect(0)
        Timer.create({identifier='battleLoop',function_name='oneBattle1',delay=1.5,repetitions=0})
    end
end
function oneBattle1()
    battleLoop = battleLoop + 1
    if battleLoop == 1 then
        if testing == 'yes' then print ('battleLoop='..battleLoop) end
        --[[initial die rolls-]]
        odds = oddsOfVictory(inventory[player].warriors,brigands)
        changeLCD('  ')
        showPic('')

        --[[test to see if initial battle with minimum warriors is lost]]
        if odds=='brigands' and inventory[player].warriors <= 1 then
            if testing == 'yes' then
                print('LOSS!')
                print ('odds='..odds..',countPlayers()='..countPlayers()..',warriors='..inventory[player].warriors)
            end
            bailed = 'yes'
        end


        --[[if bail, goto 5--]]
        if bailed == 'yes' then
            battleLoop = 4
        end
    elseif battleLoop == 2 and bailed == 'yes' then bailOut()
    elseif battleLoop == 2 and bailed ~= 'yes' then
        if testing == 'yes' then print ('battleLoop='..battleLoop) end
        if testing == 'yes' then print ('odds='..odds..',countPlayers()='..countPlayers()..',warriors='..inventory[player].warriors) end
        --[[warrior plus or minus--]]
        if odds == 'brigands' then
            inventory[player].warriors = inventory[player].warriors - 1
            maxGold(player)
            if inventory[player].warriors == 1 then
                scorecards[player].warriors.setName('1 WARRIOR')
            else
                scorecards[player].warriors.setName(inventory[player].warriors .. ' WARRIORS')
            end
        else
            brigands = math.floor(brigands / 2)
        end
        --[[show warriors--]]
        changeLCD(inventory[player].warriors)
        showPic('warriors')
        soundboard.AssetBundle.playTriggerEffect(0)
    elseif battleLoop == 3 then
        if testing == 'yes' then print ('battleLoop='..battleLoop) end
        --[[show brigands--]]
        changeLCD(brigands)
        showPic('brigands')
        soundboard.AssetBundle.playTriggerEffect(0)
    elseif battleLoop == 4 then
        if testing == 'yes' then print ('battleLoop='..battleLoop) end
        changeLCD('  ')
        showPic()
        if odds == 'brigands' then --[[roll greater than odds, loss --]]
            soundboard.AssetBundle.playTriggerEffect(3)
             --[[if no bail, then destination is 2--]]
            if bailed == 'no' then battleLoop = 1 end
            --[[check if next roll is a fatal loss or a bail--]]
            --[[roll again--]]
            odds = oddsOfVictory(inventory[player].warriors,brigands)
            if odds == 'brigands' and (inventory[player].warriors<=2 and countPlayers()>1) or (inventory[player].warriors<=1 and countPlayers()==1) then
                --[[yep--]]
                battleLoop = 4
            end
        else --[[roll less than or equal to odds, win --]]
            soundboard.AssetBundle.playTriggerEffect(4)
             --[[if no bail, then destination is 2--]]
            if bailed == 'no' then battleLoop = 1 end
            if brigands == 0 then --[[end battle --]]
                Timer.destroy('battleLoop')
                if gamePhase ~= 'towerBattle' then --[[award treasure--]]
                    Timer.create({identifier='treasure',function_name='treasure',delay=2,repetitions=1})
                else --[[victory!--]]
                    Timer.create({identifier='victory',function_name='victory',delay=1.5,repetitions=1})
                end
            else --[[check if next roll is a fatal loss or a bail--]]
                --[[roll again--]]

                odds = oddsOfVictory(inventory[player].warriors,brigands)
                if odds == 'brigands' and ((inventory[player].warriors<=2 and countPlayers()>1) or (inventory[player].warriors<=1 and countPlayers()==1)) then
                    --[[yep--]]
                    if testing == 'yes' then print ('odds='..odds..',countPlayers()='..countPlayers()..',warriors='..inventory[player].warriors) end
                    battleLoop = 4
                end
            end
        end
    elseif battleLoop == 5 then
        --[[player bailed--]]
        bailOut()
    else
        Timer.destroy('battleLoop')
        endTurn()
    end
end
function bailOut()
    if testing == 'yes' then print ('battleLoop=bailOut') end
    Timer.destroy('battleLoop')
    inventory[player].warriors = inventory[player].warriors - 1
    if inventory[player].warriors < 1 and countPlayers()>1 then inventory[player].warriors = 1 end
    maxGold(player)
    if inventory[player].warriors == 1 then
        scorecards[player].warriors.setName('1 WARRIOR')
    else
        scorecards[player].warriors.setName(inventory[player].warriors .. ' WARRIORS')
    end
    changeLCD('')
    showPic('warriors')
    soundboard.AssetBundle.playTriggerEffect(8)
    bailed = 'no'
    if inventory[player].warriors == 0 then
        Timer.create({identifier='showScore',function_name='showScore',delay=3.5,repetitions=1})
    else
        Timer.create({identifier='endTurn',function_name='endTurn',delay=3.5,repetitions=1})
    end
end
function treasure()
    doWeDoThis = anyTreasure()
    if doWeDoThis == 'nope' then
        throbbit('on')
        endTurn()
    else
        treasureOK()
    end
end
function treasureOK()
        changePhase('treasure')
        Timer.destroy('treasure')
        Timer.destroy('grindTimer')
        treasureGold = goldAward()
        if currentReel ~= wedgeReels['gold'] then
            grindingFunction = 'treasureOK'
            grind('gold')
        else
            throbbit('off')
            inventory[player].gold = inventory[player].gold + treasureGold
            maxGold(player)
            repeat1pic='gold'
            repeat1lcd=inventory[player].gold

            t100 = itemAward()
            treasureItem = 'none'

            if t100 == 'key' then
                if inventory[player].quad == 4 or inventory[player].quad == 0 or
                (inventory[player].quad == 1 and inventory[player].brassk == 1) or
                (inventory[player].quad == 2 and inventory[player].silverk == 1) or
                (inventory[player].quad == 3 and inventory[player].goldk == 1) then
                    treasureItem = 'none'
                else
                    if inventory[player].quad == 1 then
                        inventory[player].brassk = 1
                        treasureItem = 'brasskey'
                        scorecards[player].brassk.setColorTint({1,1,1})
                        scorecards[player].brassk.setName('BRASS KEY')
                    elseif inventory[player].quad == 2 then
                        inventory[player].silverk = 1
                        treasureItem = 'silverkey'
                        scorecards[player].silverk.setColorTint({1,1,1})
                        scorecards[player].silverk.setName('SILVER KEY')
                    elseif inventory[player].quad == 3 then
                        inventory[player].goldk = 1
                        treasureItem = 'goldkey'
                        scorecards[player].goldk.setColorTint({1,1,1})
                        scorecards[player].goldk.setName('SILVER KEY')
                    end
                end
            elseif t100 == 'sword' then
                if inventory[player].sword == 1 then
                    treasureItem = 'none'
                else
                    inventory[player].sword = 1
                    treasureItem = 'sword'
                    scorecards[player].sword.setColorTint({1,1,1})
                    scorecards[player].sword.setName('SWORD')
                end
            elseif t100 == 'pegasus' then
                if inventory[player].pegasus == 1 then
                    treasureItem = 'none'
                else
                    inventory[player].pegasus = 1
                    treasureItem = 'pegasus'
                    scorecards[player].pegasus.setColorTint({1,1,1})
                    scorecards[player].pegasus.setName('PEGASUS')
                end
            elseif t100 == 'wizard' then
                if (inventory[1].cursed + inventory[2].cursed + inventory[3].cursed + inventory[4].cursed > 0) or countPlayers() < 2 then
                    treasureItem = 'none'
                else
                    treasureItem = 'wizard'
                end
            else
                treasureItem = 'none'
            end
            showPic('gold')
            changeLCD(inventory[player].gold)
            scorecards[player].gold.setName(inventory[player].gold .. ' GOLD')
            soundboard.AssetBundle.playTriggerEffect(0)
            Timer.create({identifier='testTreasure',function_name='testTreasure',delay=1.5,repetitions=1})
        end
end
function testTreasure()
    changePhase('testTreasure')
    Timer.destroy('testTreasure')
    if treasureItem == 'none' then endTurn() else showTreasure() end
end
function showTreasure()
    changePhase('showTreasure')
    if currentReel ~= wedgeReels[treasureItem] then
        grindingFunction = 'showTreasure'
        grind(treasureItem)
    else
        changeLCD('  ')
        showPic(treasureItem)
        if treasureItem == 'wizard' then
            changeLCD('  ')
            showPic('wizard')
            repeat2lcd='  '
            repeat2pic='wizard'
            soundboard.AssetBundle.playTriggerEffect(0)
            Timer.create({identifier='castCurse',function_name='castCurse',delay=1.5,repetitions=1})
        elseif treasureItem == 'pegasus' then
            changeLCD('  ')
            showPic('pegasus')
            repeat2lcd='  '
            repeat2pic='pegasus'
            soundboard.AssetBundle.playTriggerEffect(15)
            Timer.create({identifier='endTreasure',function_name='endTreasure',delay=2,repetitions=1})
        else
            changeLCD('  ')
            showPic(treasureItem)
            repeat2lcd='  '
            repeat2pic=treasureItem
            soundboard.AssetBundle.playTriggerEffect(0)
            Timer.create({identifier='endTreasure',function_name='endTreasure',delay=1.5,repetitions=1})
        end
    end
end
function endTreasure()
    Timer.destroy('endTreasure')
    endTurn()
end
function castCurse()
    changePhase('chooseCurse')
    throbbit('on')
    showPic()
    curseVictim()
end


function moveClick()
    if gamePhase == 'startTurnWait' then
    referringFunction = 'moveClick'
    if foodStatus == 'check' then needsFood() else
        inventory[player].moves = inventory[player].moves + 1
        Timer.destroy('foodChecker')
        changePhase('move')
        throbbit('off')
        moveRoll = moveResult()
        if moveRoll == 'plague' then
            if inventory[player].healer == 0 then plague() else healer() end
        elseif moveRoll == 'lost' then
            if inventory[player].scout == 0 then lost() else scout() end
        elseif moveRoll == 'dragon' then
            if inventory[player].sword == 0 then dragon() else sword() end
        elseif moveRoll == 'battle' then
            soundboard.AssetBundle.playTriggerEffect(2)
            showPic()
            changeLCD('  ')
            throbbit('off')
            battle()
        else
            safeMove()
        end
    end
    end
end
--[[NOTHING--]]
function safeMove()
    soundboard.AssetBundle.playTriggerEffect(0)
    showPic()
    changeLCD('  ')
    Timer.create({identifier="endTurn",function_name='endTurn',delay=0.1,repetitions=1})
end
--[[DRAGON--]]
function dragon()
    Timer.destroy('grindTimer')
    if currentReel ~= wedgeReels['dragon'] then
        grindingFunction = 'dragon'
        grind('dragon')
    else
        changeLCD('  ')
        showPic('dragon')
        changePhase('dragonattack')
        dragonLoop = 0
        soundboard.AssetBundle.playTriggerEffect(10)
        Timer.create({identifier='dragonTimer',function_name='dragonAttack',delay=1.5,repetitions=0})
    end
end
function dragonAttack()
    dragonLoop = dragonLoop + 1
    if dragonLoop == 1 or dragonLoop == 3 then
        changeLCD('  ')
        showPic()
        soundboard.AssetBundle.playTriggerEffect(16)
    elseif dragonLoop == 2 then
        local dragonTakeW = math.floor(inventory[player].warriors / 4)
        dragonWarriors = dragonWarriors + dragonTakeW
        if dragonWarriors > 99 then dragonWarriors = 99 end
        inventory[player].warriors = inventory[player].warriors - dragonTakeW
        if inventory[player].warriors == 1 then
            scorecards[player].warriors.setName('1 WARRIOR')
        else
            scorecards[player].warriors.setName(inventory[player].warriors .. ' WARRIORS')
        end
        changeLCD(inventory[player].warriors)
        showPic('warriors')
        repeat1lcd=inventory[player].warriors
        repeat1pic='warriors'
        soundboard.AssetBundle.playTriggerEffect(0)
    elseif dragonLoop == 4 then
        local dragonTakeG = math.floor(inventory[player].gold / 4)
        dragonGold = dragonGold + dragonTakeG
        if dragonGold > 99 then dragonGold = 99 end
        inventory[player].gold = inventory[player].gold - dragonTakeG
        maxGold(player)
        scorecards[player].gold.setName(inventory[player].gold .. ' GOLD')
        changeLCD(inventory[player].gold)
        showPic('gold')
        repeat2lcd=inventory[player].gold
        repeat2pic='gold'
        soundboard.AssetBundle.playTriggerEffect(0)
    else
        Timer.destroy('dragonTimer')
        endTurn()
    end
end
function sword()
    Timer.destroy('grindTimer')
    if currentReel ~= wedgeReels['dragon'] then
        grindingFunction = 'sword'
        grind('dragon')
    else
        changeLCD('  ')
        showPic('dragon')
        changePhase('swordkill')
        swordLoop = 0
        soundboard.AssetBundle.playTriggerEffect(11)
        Timer.create({identifier='swordStart',function_name='swordStart',delay=1.15,repetitions=1})
    end
end
function swordStart()
    showPic('sword')
    inventory[player].sword = 0
    scorecards[player].sword.setColorTint({0,0,0})
    scorecards[player].sword.setName('')
    Timer.create({identifier='swordTempo',function_name='swordTempo',delay=1.85,repetitions=1})
end
function swordTempo()
    Timer.destroy('swordTempo')
    Timer.create({identifier='swordTimer',function_name='swordReward',delay=1.5,repetitions=0})
end
function swordReward()
    swordLoop = swordLoop + 1
    if swordLoop == 1 or swordLoop == 3 then
        changeLCD('  ')
        showPic()
        soundboard.AssetBundle.playTriggerEffect(16)
    elseif swordLoop == 2 then
        inventory[player].warriors = inventory[player].warriors + dragonWarriors
        if inventory[player].warriors > 99 then inventory[player].warriors = 99 end
        dragonWarriors = 2
        if inventory[player].warriors == 1 then
            scorecards[player].warriors.setName('1 WARRIOR')
        else
            scorecards[player].warriors.setName(inventory[player].warriors .. ' WARRIORS')
        end
        changeLCD(inventory[player].warriors)
        showPic('warriors')
        repeat1lcd=inventory[player].warriors
        repeat1pic='warriors'
        soundboard.AssetBundle.playTriggerEffect(0)
    elseif swordLoop == 4 then
        inventory[player].gold = inventory[player].gold + dragonGold
        if inventory[player].gold > 99 then inventory[player].gold = 99 end
        dragonGold = 6
        maxGold(player)
        scorecards[player].gold.setName(inventory[player].gold .. ' GOLD')
        changeLCD(inventory[player].gold)
        showPic('gold')
        repeat2lcd=inventory[player].gold
        repeat2pic='gold'
        soundboard.AssetBundle.playTriggerEffect(0)
    else
        Timer.destroy('swordTimer')
        endTurn()
    end
end
--[[PLAGUE--]]
function plague()
    Timer.destroy('grindTimer')
    if currentReel ~= wedgeReels['plague'] then
        grindingFunction = 'plague'
        grind('plague')
    else
        changeLCD('  ')
        showPic('plague')
        changePhase('plague')
        soundboard.AssetBundle.playTriggerEffect(8)
        if inventory[player].warriors <= 2 and countPlayers() < 2 then
            inventory[player].warriors = 0
            Timer.create({identifier="showScore",function_name='showScore',delay=3.5,repetitions=1})
        else
            Timer.create({identifier="plagueTimer1",function_name='plague1',delay=3.5,repetitions=1})
        end
    end
end
function plague1()
    Timer.destroy('grindTimer')
    if currentReel ~= wedgeReels['warriors'] then
        grindingFunction = 'plague1'
        grind('warriors')
    else
        Timer.destroy('plagueTimer1')
        inventory[player].warriors = inventory[player].warriors - 2
        maxGold(player)
        if inventory[player].warriors < 1 then inventory[player].warriors = 1 end
        soundboard.AssetBundle.playTriggerEffect(0)
        showPic('warriors')
        if inventory[player].warriors == 1 then
            scorecards[player].warriors.setName('1 WARRIOR')
        else
            scorecards[player].warriors.setName(inventory[player].warriors .. ' WARRIORS')
        end
        changeLCD(inventory[player].warriors)
        repeat1lcd=inventory[player].warriors
        repeat1pic='warriors'
        Timer.create({identifier="endTurn",function_name='endTurn',delay=2,repetitions=1})
        end
end
function healer()
    Timer.destroy('grindTimer')
    if currentReel ~= wedgeReels['plague'] then
        grindingFunction = 'healer'
        grind('plague')
    else
        changeLCD('  ')
        showPic('plague')
        changePhase('healer')
        healup=0
        soundboard.AssetBundle.playTriggerEffect(0)
        Timer.create({identifier="healerTimer1",function_name='healer1',delay=2,repetitions=0})
    end
end
function healer1()
    healup = healup + 1
    if healup == 1 or healup == 3then
        changeLCD('  ')
        showPic()
        soundboard.AssetBundle.playTriggerEffect(17)
    elseif healup == 2 then
        changeLCD('  ')
        showPic('healer')
        soundboard.AssetBundle.playTriggerEffect(0)
    elseif healup == 4 then
        inventory[player].warriors = inventory[player].warriors + 2
        if inventory[player].warriors > 99 then
            inventory[player].warriors = 99
        end
        soundboard.AssetBundle.playTriggerEffect(0)
        showPic('warriors')
        scorecards[player].warriors.setName(inventory[player].warriors .. ' WARRIORS')
        changeLCD(inventory[player].warriors)
        repeat1lcd=inventory[player].warriors
        repeat1pic='warriors'
    else
        Timer.destroy('healerTimer1')
        endTurn()
    end
end
function lost()
    Timer.destroy('grindTimer')
    if currentReel ~= wedgeReels['lost'] then
        grindingFunction = 'lost'
        grind('lost')
    else
        changeLCD('  ')
        showPic('lost')
        changePhase('lost')
        soundboard.AssetBundle.playTriggerEffect(12)
        tokens[player].setPositionSmooth({tokenX,4,tokenZ})
        Timer.create({identifier="endTurn",function_name='endTurn',delay=2,repetitions=1})
    end
end
function scout()
    Timer.destroy('grindTimer')
    if currentReel ~= wedgeReels['lost'] then
        grindingFunction = 'scout'
        grind('lost')
    else
        changeLCD('  ')
        showPic('lost')
        changePhase('lost')
        scoutup=0
        soundboard.AssetBundle.playTriggerEffect(0)
        Timer.create({identifier="scoutTimer1",function_name='scout1',delay=1.5,repetitions=0})
    end
end
function scout1()
    scoutup = scoutup + 1
    if scoutup == 1 then
        changeLCD('  ')
        showPic()
        soundboard.AssetBundle.playTriggerEffect(17)
    elseif scoutup == 2 then
        changePhase('scoutAward')
        scouted = 1
        soundboard.AssetBundle.playTriggerEffect(0)
        showPic('scout')
    else
        Timer.destroy('scoutTimer1')
        playTurn()
    end
end


function clearClick()
    if gamePhase == 'endTurnWait' then
        changeLCD('  ')
        repeat1pic=''
        repeat2pic=''
        repeat3pic=''
        repeat1lcd=''
        repeat2lcd=''
        repeat3lcd=''
        soundboard.AssetBundle.playTriggerEffect(7)
        inventory[player].warriors = undoInventory.warriors
        inventory[player].gold = undoInventory.gold
        --[[inventory[player].food = undoInventory.food (nope...you still get charged food for an illegal move!)--]]
        inventory[player].scout = undoInventory.scout
        inventory[player].beast = undoInventory.beast
        inventory[player].healer = undoInventory.healer
        inventory[1].cursed = 0
        inventory[2].cursed = 0
        inventory[3].cursed = 0
        inventory[4].cursed = 0
        inventory[player].cursed = undoInventory.cursed
        inventory[player].brassk = undoInventory.brassk
        inventory[player].silverk = undoInventory.silverk
        inventory[player].goldk = undoInventory.goldk
        inventory[player].quad = undoInventory.quad
        inventory[player].sword = undoInventory.sword
        inventory[player].pegasus = undoInventory.pegasus
        tokens[player].setPositionSmooth({tokenX,4,tokenZ})
        setCards()
        changePhase('clearing')
        Timer.create({identifier="clearbTimer",function_name='clearProceed',delay=2.5,repetitions=1})
    elseif string.sub(gamePhase,1,6) == 'bazaar' then
        changeLCD('  ')
        showPic()
        changePhase('clearing')
        soundboard.AssetBundle.playTriggerEffect(7)
        Timer.create({identifier="clearbTimer",function_name='clearProceed',delay=2.5,repetitions=1})
    elseif gamePhase == 'showScore' then
        init()
    elseif gamePhase == 'chooseLevel' or gamePhase == 'choosePlayer1' then
        --[[do nothing--]]
    else
        if blindfold == 'on' then
            blindfold = 'off'
            shield.setInvisibleTo(invisibleToAll)
            broadcastToAll( 'Blindfold mode is now OFF.', {1,1,1} )
        else
            blindfold = 'on'
            shield.setInvisibleTo(visibleWho[player])
            broadcastToAll( 'Blindfold mode is now ON.', {1,1,1} )
        end
    end
end
function clearProceed()
    Timer.destroy('clearbTimer')
    playTurn()
end


function bazaarClick()
    if gamePhase == 'startTurnWait' then
        referringFunction = 'bazaarClick'
        if foodStatus == 'check' then
            needsFood()
        else
            inventory[player].moves = inventory[player].moves + 1
            inventory[player].citadel = 0
            Timer.destroy('foodChecker')
            changePhase('bazaar')
            buying = 0
            warriorPrice = math.random(5,8)
            beastPrice   = math.random(17,26)
            scoutPrice   = math.random(17,26)
            healerPrice  = math.random(17,26)
            --[PRICE RANGES CONFIRMED BY DISASSEMBLY OF ROM DUMP OF TMS-1400 CHIP FULL CERTANITY--]
            changeLCD('  ')
            showPic()
            soundboard.AssetBundle.playTriggerEffect(5)
            Timer.create({identifier="offerWarrior",function_name='offerWarrior',delay=3.5,repetitions=1})
        end
    else
    end
end
function offerWarrior()
    changePhase('offeringWarrior')
    Timer.destroy('offerWarrior')
    Timer.destroy('grindTimer')
    if currentReel ~= wedgeReels['warrior'] then
        grindingFunction = 'offerWarrior'
        grind('warrior')
    else
        throbbit('off')
        changeLCD(warriorPrice)
        showPic('warrior')
        soundboard.AssetBundle.playTriggerEffect(0)
        Timer.create({identifier="buyWarrior",function_name='buyWarrior',delay=1.5,repetitions=1})
    end
end
function buyWarrior()
    Timer.destroy('buyWarrior')
    changePhase('bazaarWarrior')
    throbbit('on')
    changeLCD('--')
    showPic()
end
function offerFood()
    changePhase('offeringFood')
    Timer.destroy('offerFood')
    Timer.destroy('grindTimer')
    if currentReel ~= wedgeReels['food'] then
        grindingFunction = 'offerFood'
        grind('food')
    else
        throbbit('off')
        changeLCD('01')
        showPic('food')
        soundboard.AssetBundle.playTriggerEffect(0)
        Timer.create({identifier="buyFood",function_name='buyFood',delay=1.5,repetitions=1})
    end
end
function buyFood()
    Timer.destroy('buyFood')
    changePhase('bazaarFood')
    throbbit('on')
    changeLCD('--')
    showPic()
end
function offerBeast()
    changePhase('offeringBeast')
    Timer.destroy('offerBeast')
    Timer.destroy('grindTimer')
    if currentReel ~= wedgeReels['beast'] then
        grindingFunction = 'offerBeast'
        grind('beast')
    else
        throbbit('off')
        changeLCD(beastPrice)
        showPic('beast')
        soundboard.AssetBundle.playTriggerEffect(0)
        Timer.create({identifier="buyBeast",function_name='buyBeast',delay=1.5,repetitions=1})
    end
end
function buyBeast()
    Timer.destroy('buyBeast')
    changePhase('bazaarBeast')
    throbbit('on')
    changeLCD('--')
    showPic()
end
function offerScout()
    changePhase('offeringScout')
    Timer.destroy('offerScout')
    Timer.destroy('grindTimer')
    if currentReel ~= wedgeReels['scout'] then
        grindingFunction = 'offerScout'
        grind('scout')
    else
        throbbit('off')
        changeLCD(scoutPrice)
        showPic('scout')
        soundboard.AssetBundle.playTriggerEffect(0)
        Timer.create({identifier="buyScout",function_name='buyScout',delay=1.5,repetitions=1})
    end
end
function buyScout()
    Timer.destroy('buyScout')
    changePhase('bazaarScout')
    throbbit('on')
    changeLCD('--')
    showPic()
end
function offerHealer()
    changePhase('offeringHealer')
    Timer.destroy('offerHealer')
    Timer.destroy('grindTimer')
    if currentReel ~= wedgeReels['healer'] then
        grindingFunction = 'offerHealer'
        grind('healer')
    else
        throbbit('off')
        changeLCD(healerPrice)
        showPic('healer')
        soundboard.AssetBundle.playTriggerEffect(0)
        Timer.create({identifier="buyHealer",function_name='buyHealer',delay=1.5,repetitions=1})
    end
end
function buyHealer()
    Timer.destroy('buyHealer')
    changePhase('bazaarHealer')
    throbbit('on')
    changeLCD('--')
    showPic()
end
function bought()
    changePhase('bought')
    Timer.destroy('grindTimer')
    if currentReel ~= wedgeReels['gold'] then
        grindingFunction = 'bought'
        grind('gold')
    else
        throbbit('off')
        changeLCD(inventory[player].gold)
        showPic('gold')
        repeat1pic='gold'
        repeat1lcd=inventory[player].gold
        soundboard.AssetBundle.playTriggerEffect(0)
        Timer.create({identifier="bazaarClosed",function_name='closeShop',delay=1.5,repetitions=1})
    end
end
function bazaarClosed()
    changePhase('bazaarclosed')
    Timer.destroy('grindTimer')
    if currentReel ~= wedgeReels['closed'] then
        grindingFunction = 'bazaarClosed'
        grind('closed')
    else
        throbbit('off')
        changeLCD('  ')
        showPic('closed')
        soundboard.AssetBundle.playTriggerEffect(12)
        Timer.create({identifier="bazaarClosed",function_name='closeShop',delay=2.5,repetitions=1})
    end
end
function closeShop()
    Timer.destroy('bazaarClosed')
    endTurn()
end


function frontierClick()
if gamePhase == 'startTurnWait' then
    referringFunction = 'frontierClick'
    if foodStatus == 'check' then needsFood() else
    inventory[player].moves = inventory[player].moves + 1
    Timer.destroy('foodChecker')
    if gamePhase == 'startTurnWait' then
        changePhase('frontier')
        if  (inventory[player].quad == 1 and inventory[player].brassk < 1) or
            (inventory[player].quad == 2 and inventory[player].silverk < 1) or
            (inventory[player].quad == 3 and inventory[player].goldk < 1) then
                keyMissing('missing')
        elseif inventory[player].quad == 4 then
                keyMissing('')
        else
            frontier()
        end
    end
    end
else
end
end
function frontier()
    changeLCD('  ')
    showPic()
    soundboard.AssetBundle.playTriggerEffect(13)
    inventory[player].quad = inventory[player].quad + 1
    Timer.create({identifier="endTurn",function_name='endTurn',delay=2,repetitions=1})
end
function keyMissing(km)
    Timer.destroy('grindTimer')
    if currentReel ~= wedgeReels['missing'] and (km=='missing' or km=='allmissing') then
        grindingFunction = 'keyMissing'
        grind('missing')
    else
        changeLCD('  ')
        if (inventory[player].quad == 4 and gamePhase=='frontier') or (inventory[player].quad == 3 and gamePhase=='riddlenotnow') then showPic() else showPic('missing') end
        soundboard.AssetBundle.playTriggerEffect(12)
        if km ~= 'allmissing' then tokens[player].setPositionSmooth({tokenX,4,tokenZ}) end
        Timer.create({identifier="endTurn",function_name='endTurn',delay=2.5,repetitions=1})
    end
end


function repeatClick()
    if gamePhase == 'bazaarWarrior' then
        changePhase('offerWarrior')
        throbbit('off')
        changeLCD(warriorPrice)
        showPic('warrior')
        soundboard.AssetBundle.playTriggerEffect(0)
        Timer.create({identifier="buyWarrior",function_name='buyWarrior',delay=1.5,repetitions=1})
    elseif gamePhase == 'showScore' then
        init()
    elseif gamePhase == 'bazaarFood' then
        changePhase('offerFood')
        throbbit('off')
        changeLCD('01')
        showPic('food')
        soundboard.AssetBundle.playTriggerEffect(0)
        Timer.create({identifier="buyFood",function_name='buyFood',delay=1.5,repetitions=1})
    elseif gamePhase == 'bazaarBeast' then
        changePhase('offerBeast')
        throbbit('off')
        changeLCD(beastPrice)
        showPic('beast')
        soundboard.AssetBundle.playTriggerEffect(0)
        Timer.create({identifier="buyBeast",function_name='buyBeast',delay=1.5,repetitions=1})
    elseif gamePhase == 'bazaarScout' then
        changePhase('offerScout')
        throbbit('off')
        changeLCD(scoutPrice)
        showPic('scout')
        soundboard.AssetBundle.playTriggerEffect(0)
        Timer.create({identifier="buyScout",function_name='buyScout',delay=1.5,repetitions=1})
    elseif gamePhase == 'bazaarHealer' then
        changePhase('offerHealer')
        throbbit('off')
        changeLCD(healerPrice)
        showPic('healer')
        soundboard.AssetBundle.playTriggerEffect(0)
        Timer.create({identifier="buyHealer",function_name='buyHealer',delay=1.5,repetitions=1})
    elseif gamePhase == 'riddleWait' then
        currentKey = 'no'
        riddleOfTheKeys()
    elseif gamePhase == 'endTurnWait' and repeatFunction == 'inventoryClick' then
        gamePhase = 'startTurnWait'
        inventoryClick()
    elseif gamePhase == 'endTurnWait' and repeat1pic ~= '' then
        repeatit()
    else
    end
end
function repeatit()
    changePhase('repeating')
    Timer.destroy('grindTimer')
    if currentReel ~= wedgeReels[repeat1pic] then
        grindingFunction = 'repeatit'
        grind(repeat1pic)
    else
        throbbit('off')
        showPic(repeat1pic)
        changeLCD(repeat1lcd)
        soundboard.AssetBundle.playTriggerEffect(0)
        if repeat2pic ~= '' then
            Timer.create({identifier="repeatit2",function_name='repeatit2',delay=1.5,repetitions=1})
        else
            Timer.create({identifier="endTurn",function_name='endTurn',delay=1.5,repetitions=1})
        end
    end
end
function repeatit2()
    Timer.destroy('repeatit2')
    Timer.destroy('grindTimer')
    if currentReel ~= wedgeReels[repeat2pic] then
        grindingFunction = 'repeatit2'
        grind(repeat2pic)
    else
        throbbit('off')
        showPic(repeat2pic)
        changeLCD(repeat2lcd)
        if repeat2pic == 'pegasus' then
            soundboard.AssetBundle.playTriggerEffect(15)
        else
            soundboard.AssetBundle.playTriggerEffect(0)
        end
        if repeat3pic ~= '' then
            Timer.create({identifier="repeatit3",function_name='repeatit3',delay=1.5,repetitions=1})
        else
            Timer.create({identifier="endTurn",function_name='endTurn',delay=1.5,repetitions=1})
        end
    end
end
function repeatit3()
    Timer.destroy('repeatit3')
    Timer.destroy('grindTimer')
    if currentReel ~= wedgeReels[repeat3pic] then
        grindingFunction = 'repeatit3'
        grind(repeat3pic)
    else
        throbbit('off')
        showPic(repeat3pic)
        changeLCD(repeat3lcd)
        soundboard.AssetBundle.playTriggerEffect(0)
        Timer.create({identifier="endTurn",function_name='endTurn',delay=1.5,repetitions=1})
    end
end


function citadelClick()
if gamePhase == 'startTurnWait' then
    referringFunction = 'citadelClick'
    if foodStatus == 'check' then needsFood() else
        inventory[player].moves = inventory[player].moves + 1
        Timer.destroy('foodChecker')
        if gamePhase == 'startTurnWait' then
            changePhase('citadel')
            changeLCD('  ')
            showPic()
            citadelLoop = 0
            throbbit('off')
            soundboard.AssetBundle.playTriggerEffect(6)
            bonusWarriors = 0
            bonusGold = 0
            bonusFood = 0
            if inventory[player].warriors <= 4 then bonusWarriors = math.random(5,8) end
            if inventory[player].quad == 4 and inventory[player].warriors >=5 and inventory[player].warriors <=24 then
                bonusWarriors = inventory[player].warriors
            end
            if inventory[player].gold <= 7 then bonusGold = math.random(9,16) end
            if inventory[player].food <= 5 then bonusFood = math.random(9,16) end
            Timer.create({identifier="citadelTimer1",function_name='sanctuary1',delay=2.5,repetitions=0})
        end
    end
else
end
end
function sanctuary1()
    Timer.destroy('citadelTimer1')
    if bonusWarriors + bonusFood + bonusGold == 0 then
        endTurn()
    elseif inventory[player].citadel == 1 then
        endTurn()
    else
        changeLCD('  ')
        showPic()
        soundboard.AssetBundle.playTriggerEffect(16)
        Timer.create({identifier="citadelTimer",function_name='sanctuary',delay=1.5,repetitions=0})
    end
end
function sanctuary()
    citadelLoop = citadelLoop + 1
    if citadelLoop == 1 then
        if bonusWarriors > 0 then
            if inventory[player].quad == 4 and inventory[player].warriors >=5 and inventory[player].warriors <=24 then
                inventory[player].citadel = 1
            end
            inventory[player].warriors = inventory[player].warriors + bonusWarriors
            if inventory[player].warriors > 99 then
                inventory[player].warriors = 99
            end
            soundboard.AssetBundle.playTriggerEffect(0)
            showPic('warriors')
            repeat1pic = 'warriors'
            scorecards[player].warriors.setName(inventory[player].warriors .. ' WARRIORS')
            changeLCD(inventory[player].warriors)
            repeat1lcd = inventory[player].warriors
        else
            citadelLoop = 2
        end
    end
    if citadelLoop == 2 then
        if bonusWarriors > 0 and bonusGold > 0 then
            changeLCD('  ')
            showPic()
            soundboard.AssetBundle.playTriggerEffect(16)
        else
            citadelLoop = 3
        end
    end
    if citadelLoop == 3 then
        if bonusGold > 0 then
            inventory[player].gold = inventory[player].gold + bonusGold
            if inventory[player].gold > 99 then
                inventory[player].gold = 99
            end
            maxGold(player)
            soundboard.AssetBundle.playTriggerEffect(0)
            showPic('gold')
            scorecards[player].gold.setName(inventory[player].gold .. ' GOLD')
            changeLCD(inventory[player].gold)
            if repeat1pic == '' then
                repeat1pic = 'gold'
                repeat1lcd = inventory[player].gold
            else
                repeat2pic = 'gold'
                repeat2lcd = inventory[player].gold
            end
        else
            citadelLoop = 4
        end
    end
    if citadelLoop == 4 then
        if (bonusWarriors > 0 or bonusGold > 0) and bonusFood > 0 then
            changeLCD('  ')
            showPic()
            soundboard.AssetBundle.playTriggerEffect(16)
        else
            citadelLoop = 5
        end
    end
    if citadelLoop == 5 then
        if bonusFood > 0 then
            inventory[player].food = inventory[player].food + bonusFood
            if inventory[player].food > 99 then
                inventory[player].food = 99
            end
            soundboard.AssetBundle.playTriggerEffect(0)
            showPic('food')
            scorecards[player].food.setName(inventory[player].food .. ' FOOD')
            changeLCD(inventory[player].food)
            if repeat1pic == '' then
                repeat1pic = 'food'
                repeat1lcd = inventory[player].food
            elseif repeat2pic == '' then
                repeat2pic = 'food'
                repeat2lcd = inventory[player].food
            else
                repeat3pic = 'food'
                repeat3lcd = inventory[player].food
            end
        else
            citadelLoop = 6
        end
    end
    if citadelLoop == 6 then
        Timer.destroy('citadelTimer')
        endTurn()
    end
end


function inventoryClick()
    if gamePhase == 'startTurnWait' then
    referringFunction = 'inventoryClick'
    if foodStatus == 'check' then needsFood() else
        inventory[player].moves = inventory[player].moves + 1
        Timer.destroy('foodChecker')
        throbbit('off')
        Timer.destroy('grindTimer')
        if currentReel ~= wedgeReels['warriors'] then
            changePhase('inventory')
            grindingFunction = 'inventory1'
            grind('warriors')
        else
            changePhase('inventory')
            inventory1()
        end
    end
    end
end
function inventory1()
    invLoop = 0
    changeLCD(inventory[player].warriors)
    showPic('warriors')
    soundboard.AssetBundle.playTriggerEffect(0)
    Timer.create({identifier="inventoryTimer",function_name='inventoryLoop',delay=1.5,repetitions=0})
end
function inventoryLoop()
    invLoop = invLoop + 1
    if invLoop == 1 or invLoop == 3 then
        changeLCD('  ')
        showPic()
        soundboard.AssetBundle.playTriggerEffect(16)
    end
    if invLoop == 2 then
        changeLCD(inventory[player].gold)
        showPic('gold')
        soundboard.AssetBundle.playTriggerEffect(0)
    end
    if invLoop == 4 then
        changeLCD(inventory[player].food)
        showPic('food')
        soundboard.AssetBundle.playTriggerEffect(0)
    end
    if invLoop == 5 then
        if inventory[player].beast ~= 0 then
            changeLCD('  ')
            showPic('beast')
            soundboard.AssetBundle.playTriggerEffect(0)
        else
            invLoop = 6
        end
    end
    if invLoop == 6 then
        if inventory[player].scout ~= 0 or inventory[player].healer ~= 0 then
            changeLCD('  ')
            showPic()
            soundboard.AssetBundle.playTriggerEffect(16)
        else
            invLoop = 9
        end
    end
    if invLoop == 7 then
        if inventory[player].scout ~= 0 then
            changeLCD('  ')
            showPic('scout')
            soundboard.AssetBundle.playTriggerEffect(0)
        else
            invLoop = 8
        end
    end
    if invLoop == 8 then
        if inventory[player].healer ~= 0 then
            changeLCD('  ')
            showPic('healer')
            soundboard.AssetBundle.playTriggerEffect(0)
        else
            invLoop = 9
        end
    end
    if invLoop == 9 then
        if inventory[player].sword ~= 0 or inventory[player].pegasus ~= 0 then
            changeLCD('  ')
            showPic()
            soundboard.AssetBundle.playTriggerEffect(16)
        else
            invLoop = 12
        end
    end
    if invLoop == 10 then
        if inventory[player].sword ~= 0 then
            changeLCD('  ')
            showPic('sword')
            soundboard.AssetBundle.playTriggerEffect(0)
        else
            invLoop = 11
        end
    end
    if invLoop == 11 then
        if inventory[player].pegasus ~= 0 then
            changeLCD('  ')
            showPic('pegasus')
            soundboard.AssetBundle.playTriggerEffect(0)
        else
            invLoop = 12
        end
    end
    if invLoop == 12 then
        if inventory[player].brassk ~= 0 then
            changeLCD('  ')
            showPic()
            soundboard.AssetBundle.playTriggerEffect(16)
        else
            invLoop = 100
        end
    end
    if invLoop == 13 then
        changeLCD('  ')
        showPic('brasskey')
        soundboard.AssetBundle.playTriggerEffect(0)
    end
    if invLoop == 14 then
        if inventory[player].silverk ~= 0 then
            changeLCD('  ')
            showPic('silverkey')
            soundboard.AssetBundle.playTriggerEffect(0)
        end
    end
    if invLoop == 15 then
        if inventory[player].goldk ~= 0 then
            changeLCD('  ')
            showPic('goldkey')
            soundboard.AssetBundle.playTriggerEffect(0)
        end
    end
    if invLoop > 15 then
        Timer.destroy("inventoryTimer")
        repeatFunction = 'inventoryClick'
        endTurn()
    end
end


function towerClick()
    if gamePhase == 'startTurnWait' then
        referringFunction = 'towerClick'
        if foodStatus == 'check' then
            needsFood()
        else
            inventory[player].moves = inventory[player].moves + 1
            inventory[player].citadel = 0
            Timer.destroy('foodChecker')
            if inventory[player].goldk < 1 then
                changePhase('riddlenotnow')
                changeLCD('  ')
                showPic()
                soundboard.AssetBundle.playTriggerEffect(1)
                Timer.create({identifier="keyMissing",function_name='towerMiss1',delay=3.5,repetitions=1})
            elseif inventory[player].quad < 4 then
                changePhase('riddlenotnow')
                changeLCD('  ')
                showPic()
                soundboard.AssetBundle.playTriggerEffect(1)
                Timer.create({identifier="keyMissing",function_name='towerMiss2',delay=3.5,repetitions=1})
            else
                changePhase('riddle')
                changeLCD('  ')
                showPic()
                soundboard.AssetBundle.playTriggerEffect(1)
                Timer.create({identifier="riddle",function_name='riddleOfTheKeysStart',delay=3.5,repetitions=1})
            end
        end
    else
    end
end
function towerMiss1()
    Timer.destroy('keyMissing')
    keyMissing('missing')
end
function towerMiss2()
    Timer.destroy('keyMissing')
    keyMissing('')
end
function riddleOfTheKeysStart()
    myRiddle = riddle[player]
    if testing == 'yes' then
        print('answer='..myRiddle[1]..','..myRiddle[2])
    end
    Timer.destroy('riddle')
    dtKey = 'goldkey'
    riddlePhase = 1
    riddleOfTheKeys()
end
function riddleOfTheKeys()
    changePhase('showkey')
    Timer.destroy('grindTimer')
    myRiddle = riddle[player]
    if currentReel ~= wedgeReels['brasskey'] then
        grindingFunction = 'riddleOfTheKeys'
        grind('brasskey')
    else
        throbbit('off')
        if currentKey=='no' then
            currentKey = 'yes'
        else
            if dtKey == 'goldkey' then
                dtKey = 'brasskey'
                if riddlePhase == 2 and myRiddle[1]== 'brasskey' then dtKey = 'silverkey' end
            elseif dtKey == 'brasskey' then
                dtKey = 'silverkey'
                if riddlePhase == 2 and myRiddle[1]== 'silverkey' then dtKey = 'goldkey' end
            else
                dtKey = 'goldkey'
                if riddlePhase == 2 and myRiddle[1]== 'goldkey' then dtKey = 'brasskey' end
            end
        end
        changeLCD('  ')
        showPic(dtKey)
        currentKey = 'yes'
        soundboard.AssetBundle.playTriggerEffect(0)
        Timer.create({identifier="riddleWait",function_name='riddleWait',delay=1.5,repetitions=1})
    end
end
function riddleWait()
    throbbit('on')
    if riddlePhase==1 then
        changeLCD('1 ')
    else
        changeLCD('2 ')
    end
    showPic()
    changePhase('riddleWait')
end
function victory()
    changePhase('victory')
    showPic('victory')
    changeLCD('  ')
    soundboard.AssetBundle.playTriggerEffect(14)
    Timer.create({identifier="showScore",function_name='showScore',delay=5.5,repetitions=1})
end
function showScore()
    throbbit('on')
    score = finalScore(inventory[player].moves)
    if inventory[player].warriors == 0 then score = '--' end
    changePhase('showScore')
    showPic()
    changeLCD(score)
end