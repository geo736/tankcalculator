/* Page narrative for the greenhouse and NEEMO calculators, in the site's order:
 * how it works (plain language), why it matters, then (from the page itself) the
 * formulas, a worked example at the default inputs, and what the page leaves out.
 *
 * example(d) is written against the calculator's own compute() at its defaults:
 *   d.v(id, unit)  a default input, formatted; d.p(id) a fraction input as a percentage
 *   d.h(label)     a headline figure with its unit (label matched on its start)
 *   d.r(label)     a result-table row with its unit
 * A label that no longer exists throws, and the page then omits the example rather
 * than print a number that disagrees with the calculator.
 */
(function (root) {
  'use strict';

  root.GFC_NARRATIVE = {

    'psychrometrics': {
      topic: 'psychrometrics',
      how: ['Enter the air temperature, the relative humidity and the site elevation. The calculator works out everything else about that air: how much water vapour it holds, how far it is from saturation (the <strong>vapour pressure deficit</strong>, VPD), the <strong>dew point</strong> where it would start to condense, the <strong>wet-bulb temperature</strong> an evaporative pad could cool it towards, its humidity ratio and its enthalpy (heat content).',
        'Enter the temperature of the coldest surface in the house (the glazing on a cold night, a pipe, a leaf) and the page says whether water will condense on it.'],
      why: ['Every greenhouse humidity, condensation, cooling and dehumidification question starts from this one air state. Growers set humidity targets as VPD, disease risk follows the dew point, and the wet-bulb temperature is the floor any pad, mist or fog system can reach. The same physics applies over a deep-water culture raft, inside an indoor farm, or in a fish room where warm, humid air meets a cold wall.'],
      example: function (d) {
        return 'Air at ' + d.v('t', '°C') + ' and ' + d.v('rh', '%') + ' relative humidity at sea level has a dew point of ' + d.h('Dew point') + ' and a vapour pressure deficit of ' + d.h('Vapour pressure deficit') + '. It holds ' + d.h('Vapour concentration') + ' of water vapour. A surface at ' + d.v('tsurf', '°C') + ' is below the dew point, so water condenses on it. The wet-bulb depression is only ' + d.h('Wet-bulb depression') + ', which is why evaporative cooling does little in humid air.';
      }
    },

    'energy-balance': {
      topic: 'greenhouse temperature rise',
      how: ['A greenhouse in the sun warms up until the heat it loses equals the sunlight it absorbs. The calculator first finds how hot a <strong>closed</strong> house would get above outside air (the unventilated excess), from the sunlight that gets through the cover and the heat lost through the cover, to the sky and into the soil.',
        'Then it adds ventilation. Each air change carries heat out, so the inside temperature falls towards outside along a curve that drops steeply at first and then flattens. The page reports where on that curve your air-change rate sits, how much one more air change would buy, and how much shading would do the same job.'],
      why: ['This is the trade every summer greenhouse makes: ventilation removes heat without taking light from the crop, shading removes heat by taking light. Knowing that the first 10–20 air changes per hour do most of the work tells you how big vents or fans need to be, and when more ventilation stops paying.'],
      example: function (d) {
        return 'With ' + d.v('isun', 'W/m²') + ' of sun outside, ' + d.p('tau') + ' transmission and ' + d.v('tout', '°C') + ' outside, a closed house would run ' + d.h('Unventilated excess') + ' above the outside air. At ' + d.v('ach') + ' air changes per hour the inside settles at ' + d.h('Inside temperature') + ', so ventilation has removed most of the excess, leaving ' + d.h('Excess remaining') + ' of it. One more air change per hour would cool the house only ' + d.h('Next air change') + ' more.';
      }
    },

    'greenhouse-heat-load': {
      topic: 'greenhouse heating capacity',
      how: ['The heater has to replace the heat the house loses on the coldest night it is designed for. Heat leaves two ways: <strong>through the cover</strong> (walls, roof and gables), and <strong>with the air that leaks out</strong> and is replaced by cold outside air.',
        'The calculator works out the cover area from the house dimensions, applies the cover U-value (reduced when a thermal screen is closed), adds the leakage loss from the air-change rate and the house volume, and multiplies by the difference between the set-point and the design outdoor temperature. Any sun at that hour is credited. The result is the heat per m² of floor and the heater size for the house.'],
      why: ['An undersized heater loses the crop on the one night that matters; an oversized one costs capital and runs inefficiently. In aquaponics and hydroponics the same heater often also keeps the water warm, so it is worth knowing how much of the load is the envelope and how much is leaking air. Sealing and a night screen are usually cheaper than a bigger burner.'],
      example: function (d) {
        return 'A ' + d.v('length', 'm') + ' house of ' + d.v('spans') + ' spans, each ' + d.v('spanw', 'm') + ' wide, has a cover-to-floor ratio of ' + d.h('Cover-to-floor ratio') + '. With a ' + d.v('uc') + ' W/m²·K cover and a closed screen saving ' + d.p('pscreen') + ' of it, the cover U-value falls to ' + d.r('Transmission U-value') + '. Holding ' + d.v('tin', '°C') + ' against ' + d.v('tout', '°C') + ' outside, the house loses ' + d.r('Loss through the cover') + ' through the cover and ' + d.r('Loss by infiltration') + ' by leakage. That is a design capacity of ' + d.h('Design heating capacity') + ' of floor, or ' + d.r('Installed capacity') + ' for the house.';
      }
    },

    'u-value-resistances': {
      topic: 'cover U-value',
      how: ['Heat passes through a greenhouse cover in three steps: from the inside air and the warm crop to the inner surface, through the glazing, and from the outer surface to the outside air and the cold sky. Each step has a resistance, and the calculator adds them up.',
        'It then gives the U-value two ways, because both appear in the literature: against the plain inside-to-outside air temperature difference, and against temperatures weighted for radiation to the crop and sky. The heat flow is the same either way; only the coefficient changes.'],
      why: ['Published U-values for the same glass can differ by a third, and that difference is a definition, not a better material. The glazing itself is a tiny share of the resistance; the air films on each side dominate, which is why wind, a cold clear sky or condensation on the cover change heat loss so much.'],
      example: function (d) {
        return 'For ' + d.v('d', 'mm') + ' glass with ' + d.v('tair', '°C') + ' inside, ' + d.v('tout', '°C') + ' outside and a ' + d.v('trout', '°C') + ' sky, the glazing is only ' + d.h('Glazing share') + ' of the total resistance. Measured against the air temperatures the U-value is ' + d.h('U-value, method 1') + '; against the radiation-weighted temperatures it is ' + d.h('U-value, method 2') + '. Both give the same heat loss of ' + d.h('Heat flow') + ' of floor.';
      }
    },

    'annual-heat-demand': {
      topic: 'annual heat and fuel', whyTitle: 'Why annual heat and fuel matter',
      how: ['Heater size is set by the coldest hours; fuel use is set by every hour of the year. The calculator runs the house heat balance for each of the 8,760 hours of a typical year at the chosen site, credits the sun that gets in during the day, and adds up the heat needed.',
        'It sorts those hours from coldest to warmest (a <strong>load-duration curve</strong>), so you can see how rarely the peak occurs and size the plant on the hour that is exceeded only a small share of the time. It also compares with the simpler degree-day estimate and turns the yearly heat into fuel and cost on the efficiency basis you enter.'],
      why: ['Fuel is often the largest running cost of a heated greenhouse or a warm-water aquaponic system in a cold climate. The duration curve shows whether a smaller main heater plus a backup for the few coldest hours would do, and how much a measure like a night screen saves over a year rather than only at the peak.'],
      example: function (d) {
        return 'For a ' + d.v('area', 'm²') + ' house in Amsterdam held at ' + d.v('tin', '°C') + ', the hourly balance gives ' + d.h('Annual heat demand') + ' of heat a year. Dropping the coldest ' + d.v('pct', '%') + ' of hours, the plant needs ' + d.h('Capacity') + ', or ' + d.r('Installed capacity') + ' for the house. The degree-day method on the same hours gives ' + d.r('Degree-day estimate') + ', higher because it gives no credit for the sun. At ' + d.p('eta') + ' gross efficiency on low-calorific natural gas that is ' + d.h('Fuel') + '.';
      }
    },

    'longwave-sky': {
      topic: 'sky temperature',
      how: ['A greenhouse cover radiates heat to the sky, not to the air around it. On a clear night the sky behaves like a surface far colder than the air, and drier air makes it colder still. The calculator estimates that apparent sky temperature from the air temperature, humidity and cloud cover, then works out the net radiation the cover loses to it.'],
      why: ['This is why a clear, calm night is the coldest inside a greenhouse even when a cloudy, windy night is colder outside, and why frost forms on crops and covers under a clear sky. It is the case for infrared-blocking film, closed thermal screens and keeping covers dry.'],
      example: function (d) {
        return 'On a clear night with the air at ' + d.v('tair', '°C') + ' and ' + d.v('rh', '%') + ' humidity, the sky appears to be ' + d.h('Apparent sky temperature') + '. A cover at ' + d.v('tcover', '°C') + ' facing it loses ' + d.h('Long-wave loss') + ' by radiation alone, on top of the losses to the air.';
      }
    },

    'natural-ventilation': {
      topic: 'natural ventilation',
      how: ['Roof and side vents move air two ways: <strong>wind</strong> pushing and pulling across the openings, and <strong>buoyancy</strong>, warm inside air rising out of the roof vents and drawing cooler air in low down. The calculator combines both from the vent areas, their height, the wind speed and the inside-outside temperature difference, and says which one is in charge.',
        'It then applies the penalty of an insect screen over the vents. Fine mesh blocks a lot of air, so screened vents need to be much larger for the same ventilation.'],
      why: ['Natural ventilation is the cheapest cooling a greenhouse has, but it depends on the weather. Knowing the wind speed below which buoyancy takes over tells you how the house will behave on still days, and the screen penalty tells you how much vent area to buy if you exclude insects instead of spraying for them.'],
      example: function (d) {
        return 'A ' + d.v('floor', 'm²') + ' house with ' + d.v('aroof', 'm²') + ' of roof vents and ' + d.v('aside', 'm²') + ' of side vents, in a ' + d.v('u', 'm/s') + ' wind and ' + d.v('dT', 'K') + ' warmer than outside, ventilates at ' + d.h('Ventilation rate') + '. Wind is in charge: buoyancy would only take over below ' + d.h('Crossover wind speed') + '. Choose an anti-thrips screen in the calculator to see how much more vent area the mesh would need.';
      }
    },

    'fan-ventilation': {
      topic: 'fan ventilation',
      how: ['Exhaust fans have to carry out the sun’s heat that the crop does not turn into transpiration. The calculator follows the ANSI/ASAE EP406.4 method: it takes the sunlight transmitted into the house, removes the share the crop evaporates (the <strong>evapotranspiration coefficient E</strong>), allows for heat lost or gained through the cover, and finds the air flow that keeps the rise from inlet to exhaust within the limit you set.',
        'From that air flow it counts fans, spaces them along the wall, and sizes the inlet louvres and fan power. With an evaporative pad on the inlet, the air enters cooler.'],
      why: ['Fans and their electricity are a major summer cost, and undersized fans let the house overheat on the hottest, brightest days. The answer depends heavily on E: a young or stressed crop evaporates little and needs much more air than a full, healthy canopy. A fan specification that does not state E is not really a specification.'],
      example: function (d) {
        return 'For a ' + d.v('area', 'm²') + ' house under ' + d.v('isun', 'W/m²') + ' of sun at ' + d.v('tout', '°C') + ', with E = ' + d.v('E') + ' and a ' + d.v('rise', 'K') + ' allowed rise, the fans must move ' + d.h('Air flow required') + '. That is ' + d.h('Fans') + ' fans of ' + d.v('fansize', 'm³/s') + ' each, an air-change rate of about ' + d.h('Equivalent air changes') + ', drawing ' + d.h('Fan power') + '. The exhaust leaves at ' + d.r('Exhaust temperature') + '.';
      }
    },

    'evaporative-cooling': {
      topic: 'evaporative cooling',
      how: ['Evaporating water takes heat out of the air. An evaporative pad, mist or fog system can cool air at most down to its <strong>wet-bulb temperature</strong>, and in practice only part of the way there, set by the system’s efficiency. The calculator finds the wet bulb from the outside temperature, humidity and elevation, applies the efficiency, and follows the air along a line of constant heat content to find how cool and how humid it leaves.',
        'From the air flow it then works out the cooling delivered, the water evaporated per hour and per season, the pad face area and the minimum pad water supply.'],
      why: ['Pad-and-fan and fog cooling make greenhouse production possible in hot, dry climates, and they are the main summer water use besides the crop. In humid climates the wet-bulb depression is small and so is the cooling. The calculator shows that before you buy the pads.'],
      example: function (d) {
        return 'Outside air at ' + d.v('t', '°C') + ' and ' + d.v('rh', '%') + ' humidity has a wet bulb of ' + d.r('Wet-bulb temperature') + '. A 70%-efficient aspen pad cools it by ' + d.h('Temperature drop') + ' and it leaves at ' + d.h('Humidity after the pad') + ' humidity. For ' + d.v('area', 'm²') + ' at ' + d.v('flow') + ' m³/s per m², the pad evaporates ' + d.h('Water') + ', or ' + d.r('Water over the season') + ' over ' + d.v('hours') + ' hours of cooling, and needs ' + d.r('Pad face area') + ' of pad.';
      }
    },

    'transpiration': {
      topic: 'crop transpiration',
      how: ['A crop loses water through its leaves for two reasons: the sunlight it absorbs has to be shed, and dry air pulls water out. The calculator uses the standard greenhouse <strong>big-leaf model</strong>: it works out the light absorbed by the canopy, the resistance of the leaf pores (which open in light and close in the dark), and the difference in water vapour between the leaves and the air. Their product is the transpiration rate.',
        'It reports that rate as water (grams per m² per hour and mm per period) and as the latent heat load it puts into the air.'],
      why: ['Transpiration is the crop’s water demand, so it sets irrigation. It is also the moisture the house has to get rid of, so it sets ventilation and dehumidification. In aquaponics it is the water the fish system loses through the plants every day. It is driven mostly by light, not temperature, which is why irrigation is triggered on accumulated radiation.'],
      example: function (d) {
        return 'A tomato crop under ' + d.v('rad', 'W/m²') + ' of sun outside, with the air at ' + d.v('t', '°C') + ' and ' + d.v('rh', '%') + ' humidity, transpires ' + d.h('Transpiration') + '. That is a latent heat load of ' + d.h('Latent heat load') + ' for the ventilation or dehumidifier to remove. Of the ' + d.r('Driving difference') + ' vapour difference that drives it, ' + d.r('— of which radiation') + ' comes from the radiation the leaves must shed and the rest from the dry air.';
      }
    },

    'equilibrium-humidity': {
      topic: 'humidity and condensation risk', whyTitle: 'Why humidity and condensation risk matter',
      how: ['Water vapour from the crop can leave a greenhouse by only two natural routes: <strong>out through the vents and leaks</strong> with the air, or by <strong>condensing on a cold surface</strong>, usually the cover. The calculator solves the balance between the crop’s transpiration and those two exits to find the humidity the house settles at.',
        'It reports that humidity, the dew-point depression (how close the air is to condensing), how much water condenses on the cover, and whether the crop itself is cold enough for water to form on the leaves.'],
      why: ['Wet leaves and high humidity bring Botrytis and other diseases. Knowing the free-running humidity tells you whether the house can dry itself through its vents and cover, or whether you have to pay for extra ventilation with heating, or for a dehumidifier.'],
      example: function (d) {
        return 'A tomato crop at ' + d.v('tin', '°C') + ' with ' + d.v('tout', '°C') + ' and ' + d.v('rhout', '%') + ' humidity outside, ventilated at ' + d.v('ach') + ' air changes per hour, transpires ' + d.h('Transpiration') + '. The house settles at ' + d.h('Equilibrium humidity') + ' relative humidity, with a dew-point depression of ' + d.h('Dew-point depression') + '. The cover is warmer than the dew point, so all the vapour leaves through ventilation and none condenses.';
      }
    },

    'dehumidification-routes': {
      topic: 'dehumidification options', whyTitle: 'Why the choice of dehumidifier matters',
      how: ['The calculator compares thirteen ways of taking water out of greenhouse air, from ventilation and heat-pump dehumidifiers to liquid and solid desiccants and newer membrane systems. Each is scored on its own published performance figure, on the same basis: energy per kilogram of water removed, and cost per kilogram at your energy prices.',
        'It charges each route for what it really costs the house: a cold coil pays for overcooling the air, a desiccant pays for the heat it releases, and ventilation pays for heating or cooling the air it brings in and is unavailable when outside air is wetter than inside.'],
      why: ['In closed or semi-closed greenhouses, hot-humid climates and indoor farms, removing moisture can cost as much as heating or cooling. The cheapest route depends on the weather and on what each technology really demands, and some of the options are still laboratory or pilot technology, which the page flags.'],
      example: function (d) {
        return 'Holding ' + d.v('tin', '°C') + ' and ' + d.v('rhin', '%') + ' humidity when it is ' + d.v('tout', '°C') + ' and ' + d.v('rhout', '%') + ' outside, ventilation cannot dry the house because the outside air is wetter. A heat-pump cold coil, the mature benchmark, uses ' + d.h('Cold coil reference') + ' of water removed. The lowest-energy route on paper is ' + d.h('Cheapest route') + ', but the page labels its maturity.';
      }
    },

    'co2-enrichment': {
      topic: 'CO₂ enrichment',
      how: ['To hold a CO₂ set-point you have to replace what the crop takes up and what leaks out with the air. The calculator converts the set-point from ppm to a mass per cubic metre at your temperature and elevation, works out the loss through the air exchange, adds the crop’s uptake, and gives the injection rate, the yearly CO₂ and its cost.',
        'It also sizes a buffer: how much CO₂ to store to keep enriching for a few hours when the gas comes from a boiler or engine whose heat is not wanted at that moment.'],
      why: ['Enrichment raises growth in a closed house in good light, but the same air exchange that removes heat and humidity removes the CO₂ you paid for. The calculator shows when you are feeding the crop and when you are mostly enriching the outside air.'],
      example: function (d) {
        return 'Holding ' + d.v('target', 'ppm') + ' against ' + d.v('outside', 'ppm') + ' outside, at ' + d.v('ach') + ' air changes per hour in a ' + d.v('height', 'm') + ' tall house, loses ' + d.h('Lost through the openings') + '. With the crop taking up ' + d.v('assim') + ' g/m² per hour, the injection rate is ' + d.h('Injection rate') + '. Over ' + d.v('hours') + ' enriched hours on ' + d.v('area', 'm²') + ' that is ' + d.h('Annual CO₂') + '.';
      }
    },

    'cover-transmission': {
      topic: 'cover light transmission',
      how: ['The light printed on a glazing datasheet is not the light the crop gets. The calculator starts from the cover’s hemispherical transmittance (light from the whole sky, not only straight on) and takes away, in turn, the light lost to the frame and structure, to dirt, and to condensation droplets. Shading by whitewash or a screen comes on top.',
        'It turns the result into radiation and photon light (PPFD and DLI) at the canopy, and estimates the yield effect with the light–yield elasticity, the "1% rule".'],
      why: ['Every percent of light lost costs roughly a percent of yield in fruiting crops, so the choice of glazing, the frame and how often you wash the roof matter. In aquaponics and hydroponics greenhouses the same numbers tell you how much supplemental lighting you will need in winter.'],
      example: function (d) {
        return 'A cover with ' + d.p('tauhem') + ' hemispherical transmittance, ' + d.p('fstr') + ' lost to structure, ' + d.p('fdirt') + ' to dirt and ' + d.p('fcond') + ' to condensation passes ' + d.h('Transmissivity to the canopy') + ' of outside light. Under ' + d.v('isun', 'W/m²') + ' of sun that is ' + d.h('PPFD at the canopy') + ' at the crop, or ' + d.r('Daily light integral, unshaded') + ' over ' + d.v('hours') + ' full-light hours.';
      }
    },

    'canopy-interception': {
      topic: 'canopy light and yield', whyTitle: 'Why canopy light and yield matter',
      how: ['A crop canopy absorbs light much as a cover does, with the leaf area index (LAI, m² of leaf per m² of ground) playing the part of thickness. The calculator finds the share of light the canopy intercepts, multiplies the light absorbed by a <strong>light use efficiency</strong> to get dry matter growth, and converts that to fresh yield with the harvest index and the dry matter content of the product.'],
      why: ['It links light, which you can measure and buy, to kilograms, which you sell. It shows why a young crop with little leaf wastes light, and two results that surprise people: a product with more dry matter gives fewer fresh kilograms, and a higher harvest index is the main way breeding raised yields.'],
      example: function (d) {
        return 'With ' + d.v('global') + ' MJ/m² of sun a day outside and ' + d.p('tau') + ' transmission, ' + d.h('PAR at the top') + ' of photosynthetic light reaches the crop. At an LAI of ' + d.v('lai') + ' the canopy intercepts ' + d.h('Light intercepted') + ' of it and grows ' + d.h('Growth rate') + ' of dry matter. Over ' + d.v('days') + ' days, with a harvest index of ' + d.p('hi') + ' and ' + d.p('dmc') + ' dry matter in the product, the fresh yield is ' + d.h('Fresh yield') + '.';
      }
    },

    'supplemental-light': {
      topic: 'supplemental light payback',
      how: ['The calculator asks two questions in order. First, is the lamp light large compared with the daylight reaching the crop at this site and season? It compares the lamps’ daily light integral with the sunlight inside the greenhouse. Second, does the extra yield pay for the electricity? It estimates the yield gain with the light–yield elasticity, prices it, takes off the electricity and credits the share of lamp heat that replaces heating.'],
      why: ['Supplemental light is one of the largest investments and electricity loads in a northern greenhouse. The same 200 µmol/m²/s that doubles the light in a dark December adds little in a bright month, and the crop price decides whether that extra light pays.'],
      example: function (d) {
        return 'Lamps giving ' + d.v('ppfd') + ' µmol/m²/s for ' + d.v('hours') + ' hours add ' + d.r('Lamp daily light integral') + ', against ' + d.r('Solar daily light integral inside') + ' of daylight inside, a light fraction of ' + d.h('Light fraction') + '. At ' + d.v('efficacy') + ' µmol/J they draw ' + d.h('Installed power') + ' and use ' + d.h('Electricity') + ' over ' + d.v('days') + ' days. The extra yield of ' + d.r('Extra yield') + ' leaves a margin of ' + d.h('Margin') + ' at these prices.';
      }
    },

    'root-zone-water': {
      topic: 'irrigation and drainage', whyTitle: 'Why irrigation and drainage matter',
      how: ['Under a cover there is no rain, so every litre supplied is accounted for: the crop transpires it, the substrate surface evaporates it, it drains away, or it is stored in the plants. The calculator adds transpiration and evaporation, divides by the share that should not drain to get the irrigation supply, and subtracts the drainage you recycle to get the new water you have to buy.',
        'It also sizes each irrigation event from the water the substrate holds and how much of it the crop may use between events, and gives the water use efficiency in kilograms of produce per cubic metre.'],
      why: ['Some drainage is needed to stop salts building up in the root zone, but every litre drained and not reused is water and fertiliser lost. In aquaponics the same balance sets how much make-up water the system needs, since plants transpire most of what is lost.'],
      example: function (d) {
        return 'A crop transpiring ' + d.v('transp', 'mm') + ' a day, with ' + d.v('evap', 'mm') + ' of surface evaporation and a ' + d.p('drainfrac') + ' drainage fraction, needs ' + d.h('Irrigation supply') + '. Recycling ' + d.p('recycle') + ' of the drainage cuts new water to ' + d.h('New water needed') + '. With ' + d.v('substrate', 'L') + ' of substrate per m² that is ' + d.h('Events per day') + ' events a day, and the water use efficiency is ' + d.h('Water use efficiency') + '.';
      }
    },

    'nutrient-uptake': {
      topic: 'nutrient uptake',
      how: ['The calculator builds a nutrient solution from a published recipe (in mmol/L of each ion), adds the sodium and chloride in your water, and checks the charge balance: positive and negative ions should cancel. It estimates the electrical conductivity (EC) from the sum of positive charges.',
        'Then it compares what the crop takes out with what the water it drinks brings in. From the growth rate and mineral content of the crop it works out how much nitrogen and potassium are removed per litre transpired (the <strong>uptake concentration</strong>). If that is above the recipe’s concentration the solution is being depleted; if below, the nutrient accumulates.'],
      why: ['EC tells you how much is dissolved, not what. In recirculating hydroponics and aquaponics the mix drifts because the crop does not take ions up in the proportions they are supplied. Comparing uptake with supply shows which nutrients will run down or build up before a lab test does.'],
      example: function (d) {
        return 'The closed-loop tomato recipe with ' + d.v('na') + ' mmol/L of sodium in the water has an EC of ' + d.h('Electrical conductivity') + '. A crop growing ' + d.v('growth') + ' kg/m² of fresh weight a day at ' + d.p('mineralfrac') + ' mineral content, transpiring ' + d.v('transp', 'L/m²') + ' a day, removes nitrogen at ' + d.h('Nitrogen uptake concentration') + ' of water taken up, against ' + d.r('Nitrogen supply concentration') + ' in the recipe. At these inputs the crop strips nitrogen faster than the water replaces it, so the recipe would need to be stronger, or the growth and mineral inputs checked against your crop.';
      }
    },

    'salt-accumulation': {
      topic: 'salt build-up',
      how: ['Water leaves a closed system as transpiration and in the harvested crop, and both carry almost no salt. The top-up water that replaces it does. Ions the crop does not need, mainly sodium and chloride, therefore build up until part of the solution is discharged. The calculator works out how much water the crop can take up before sodium reaches the crop’s limit, how often you must discharge, and how much leachate that is a year.',
        'It credits the small amount of sodium the crop takes up itself, which caps the build-up, and estimates the yield lost at the resulting salinity with the Maas-Hoffman threshold model.'],
      why: ['Salt build-up, not plumbing, decides how closed a recirculating hydroponic or aquaponic system can be. Feed water with more sodium means more frequent discharge, more water and fertiliser lost, and in many places a discharge that must be treated.'],
      example: function (d) {
        return 'With ' + d.v('cin') + ' mmol/L of sodium in the refill water and ' + d.v('volume', 'L') + ' of solution per m², a tomato crop reaches its sodium limit after ' + d.h('Uptake to reach the ceiling') + ' of uptake. At ' + d.v('uptake', 'L/m²') + ' of uptake a year that is a discharge rate of ' + d.r('Discharge cycles per year') + ' (cycles a year), giving ' + d.h('Discharge') + ' of leachate a year. The salinity left costs little yield: ' + d.h('Yield at the resulting salinity') + ' of the unsalted yield.';
      }
    },

    'indoor-farm': {
      topic: 'indoor farm energy',
      how: ['In a sunless farm all the lamp power ends up as heat inside the building. Part leaves as water vapour from the crop (latent heat) and the rest warms the air (sensible heat), and the cooling and dehumidifying plant has to remove both. The calculator splits the lamp power into those two loads, adds the electricity for the plant that removes them, and gives the condensate collected.',
        'It then turns light into produce with a light productivity (grams per mole of light), and reports electricity per kilogram, yield per m² across a stack of tiers, and the margin after electricity.'],
      why: ['Electricity is the defining cost of vertical and container farms. Efficient fixtures cut it twice, once for the light and once for the cooling. The condensate is also clean water you can return to the system, which matters for hydroponic and aquaponic indoor farms.'],
      example: function (d) {
        return 'Lighting at ' + d.v('ppfd') + ' µmol/m²/s for ' + d.v('hours') + ' hours with ' + d.v('efficacy') + ' µmol/J fixtures draws ' + d.r('Installed lamp power') + ' of lamp power, and the plant must remove all of it as a cooling duty of ' + d.h('Cooling duty') + '. At ' + d.v('lp') + ' g of lettuce per mole of light the farm uses ' + d.h('Electricity per kilogram') + ' produced. At ' + d.v('pel') + ' per kWh and a crop price of ' + d.v('pcrop') + ' per kg the margin after electricity is ' + d.h('Margin after electricity') + ', which is why efficacy and electricity price dominate indoor-farm economics.';
      }
    },

    'tgc-growth': {
      topic: 'days to harvest', whyTitle: 'Why grow-out time matters',
      how: ['The <strong>thermal growth coefficient</strong> (TGC) describes fish growth as a function of water temperature: each degree-day adds a fixed amount to the cube root of body weight. Turning that round gives the days from stocking weight to harvest weight at a given temperature.',
        'The calculator adds survival over the cycle, the feed needed at your feed conversion ratio, the biomass at harvest, and the tank volume that biomass needs at your maximum stocking density.'],
      why: ['Grow-out time sets how many cohorts a year a RAS or aquaponic system can produce, and therefore its revenue, feed budget and tank space. Because growth tracks degree-days, a few degrees warmer water can cut weeks off the cycle; the calculator shows by how much.'],
      example: function (d) {
        return 'Fish stocked at ' + d.v('ibw', 'g') + ' and grown to ' + d.v('fbw', 'g') + ' at ' + d.v('temp', '°C') + ' with a TGC of ' + d.v('tgc') + ' take ' + d.h('Grow-out time') + '. From ' + d.v('nstock') + ' fish stocked, about ' + d.r('Fish at harvest') + ' survive, giving ' + d.h('Biomass at harvest') + ' and needing ' + d.h('Feed required') + ' of feed at an FCR of ' + d.v('fcr') + '. Held at ' + d.v('density') + ' kg/m³ with half the space in use, the cohort needs ' + d.h('Tank volume needed') + ' of tanks.';
      }
    },

    'ras-thermal-load': {
      topic: 'RAS water heating and cooling', whyTitle: 'Why RAS water heating and cooling matter',
      how: ['A recirculating system saves most of its water but not the heat in it. Every cubic metre of make-up water arrives at its source temperature and has to be brought to the rearing temperature. The calculator multiplies the make-up water per kilogram of fish by the heat capacity of water and the temperature lift, then divides by the heat pump’s coefficient of performance to get electricity.',
        'With a seasonal swing in the source temperature it also counts the days of heating and of cooling and integrates the electricity over the year.'],
      why: ['For cold- and warm-water species alike, make-up water temperature can be a steady energy cost that grows with every litre of water exchanged. It is one more reason to keep water exchange low, and it tells you how big the heat pump or chiller has to be.'],
      example: function (d) {
        return 'Raising ' + d.v('wateruse') + ' m³ of make-up water per kg of fish from ' + d.v('ambient', '°C') + ' to ' + d.v('target', '°C') + ' takes ' + d.h('Thermal duty') + ' of heat. A heat pump with a COP of ' + d.v('cop') + ' turns that into ' + d.h('Electrical load') + ' of electricity, or ' + d.h('Annual electricity') + ' for ' + d.v('prod') + ' t of fish a year.';
      }
    },

    'digester-methane': {
      topic: 'biogas',
      how: ['Fish sludge and other organic waste can be digested without oxygen to make biogas. The calculator uses the ADM1-R4 model: the carbohydrate, protein and fat in the volatile solids break down at their own rates, so the time the sludge spends in the digester decides how much of each is converted to methane. It reports the methane yield, the daily biogas from your throughput, the electricity an engine could make from it, and the digester volume.'],
      why: ['Solids from a RAS or aquaponic system are a disposal cost. Digesting them turns part of that cost into energy and leaves a liquid that can return nutrients to plants. Working from the sludge’s composition rather than a table average gives a more honest yield.'],
      example: function (d) {
        return 'Sludge with ' + d.p('fch') + ' carbohydrate, ' + d.p('fpr') + ' protein and ' + d.p('fli') + ' fat in its volatile solids, held ' + d.v('hrt') + ' days, yields ' + d.h('Methane yield') + ' of methane. Feeding ' + d.v('tpd') + ' t a day at ' + d.v('ts', '%') + ' solids gives ' + d.h('Methane') + ' of methane, enough for ' + d.h('Electrical output') + ' from an engine at ' + d.p('chpeff') + ' electrical efficiency, in a ' + d.h('Digester volume') + ' digester.';
      }
    }
  };
}(typeof window !== 'undefined' ? window : globalThis));
