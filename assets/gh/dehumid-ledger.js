/* The dehumidification route ledger and its scoring.
 *
 * Generated from parameters.csv in the hot-humid dehumidification model, which
 * carries one row per published parameter with a low, base and high value, the
 * source, its DOI, the evidence class and whether the primary was verified.
 * Nothing here is a round number chosen for convenience: a route with no held
 * primary source is marked, and a route published only as a ratio says so.
 *
 * Scoring is transcribed from dehumid/routes.py. The boundary rules that make
 * the routes comparable are the point of the exercise:
 *
 *   - A route that condenses water on a cold surface is charged the sensible
 *     overcooling it causes, (L + c_sens), not the latent heat alone.
 *   - A sorption route is charged the adsorption heat it dumps into the air,
 *     because in a cooling-dominated house the chiller has to remove it.
 *   - A published coefficient that is cooling output over electric input is a
 *     TOTAL cooling coefficient and carries the same burden as the coil.
 *   - Ventilation is charged the sensible heat it imports or exports, in both
 *     signs, and is unavailable whenever outside air is wetter than inside.
 */
window.DEHUMID_LEDGER = {
 "coil_heat_pump": {
  "cop_dehumid": {
   "low": 3.7,
   "base": 5.1,
   "high": 6.5,
   "unit": "-",
   "source": "Graamans 2018 / Weidner 2021",
   "doi": "10.1016/j.agsy.2017.11.003;10.1016/j.enconman.2021.114336",
   "evidence": "simulated",
   "verification": "verified-pdf",
   "boundary": "COP in dehumidification mode, not nameplate; low = Carnot-derived fixed value for a Gulf simulation, high = hourly variable-COP model for Singapore; base is the midpoint and is not itself a published value"
  },
  "c_sens_ratio": {
   "low": 1.0,
   "base": 1.14,
   "high": 1.3,
   "unit": "x L",
   "source": "Greenhouse compendium 12.2/12.6",
   "doi": "-",
   "evidence": "derived",
   "verification": "compendium",
   "boundary": "Sensible overcooling per kg condensed, as a multiple of the latent heat; 1.14 from the compendium worked air-handling case (160 W/m2 overcooling vs 140 W/m2 latent)"
  },
  "cop_at_29_7C": {
   "low": 4.33,
   "base": 4.33,
   "high": 4.33,
   "unit": "-",
   "source": "Sezen 2025",
   "doi": "10.1016/j.applthermaleng.2025.125828",
   "evidence": "simulated",
   "verification": "verified-fulltext-xml",
   "boundary": "Air-source heat pump cooling COP at 29.7 C outdoor, holding 27 C indoors; physics-based model of split air conditioners in occupied indoor spaces, not a greenhouse; the machine characteristic is what transfers"
  },
  "cop_at_36_6C": {
   "low": 2.72,
   "base": 2.72,
   "high": 2.72,
   "unit": "-",
   "source": "Sezen 2025",
   "doi": "10.1016/j.applthermaleng.2025.125828",
   "evidence": "simulated",
   "verification": "verified-fulltext-xml",
   "boundary": "Same machine and setpoint at 36.6 C outdoor. The pair gives the slope of COP against outdoor temperature: the chiller is least efficient in the hours when the latent duty is largest, which a fixed-COP model cannot represent"
  }
 },
 "forced_ventilation": {
  "max_airflow": {
   "low": 6.0,
   "base": 6.0,
   "high": 6.0,
   "unit": "m3 per m2 per h",
   "source": "Campen 2009 thesis",
   "doi": "10.18174/12805",
   "evidence": "measured",
   "verification": "verified-pdf",
   "boundary": "Maximum outside airflow required by the Dutch mechanical system"
  },
  "capex_area": {
   "low": 3.54,
   "base": 6.6,
   "high": 11.0,
   "unit": "EUR per m2",
   "source": "Vanthoor 2011; Hopwood 2024",
   "doi": "10.1016/j.biosystemseng.2024.06.005",
   "evidence": "costed",
   "verification": "verified-pdf",
   "boundary": "Installed pad-and-fan capital per square metre of greenhouse floor, indexed to ventilation capacity: 3.54 at 50 m3/m2/h rising to 8.14 at 200 m3/m2/h (Vanthoor Table 6.1, sourced from Cajamar and Vermeulen price data), with the upper bound from an independent Saudi costing of a 60-air-change negative-pressure system at 11 EUR/m2 (Hopwood Table 14). BOUNDARY: purchase and installation of the ventilation plant; excludes the greenhouse structure and the extra vent area a naturally ventilated house would need. Both figures bundle an evaporative pad with the fans, so they are an upper bound on fans alone"
  },
  "specific_fan_power": {
   "low": 300.0,
   "base": 500.0,
   "high": 1000.0,
   "unit": "J per m3",
   "source": "assumption flagged",
   "doi": "-",
   "evidence": "assumed",
   "verification": "ASSUMPTION-not-measured",
   "boundary": "Electrical energy per cubic metre of air moved. ASSUMPTION, flagged: the model previously derived this by dividing a 7.5 W/m2 installed fan power from one chapter by a 6 m3/m2/h design airflow from another, giving 4500 J/m3, which is four to nine times the specific fan power of real ventilation plant and is an artefact of pairing two numbers that are not a matched pair. The band here is the range for greenhouse and building ventilation fans; it is reported as an assumption rather than a measurement, and the route is the one most sensitive to it"
  }
 },
 "forced_vent_hx": {
  "eta_hx_sensible": {
   "low": 0.67,
   "base": 0.71,
   "high": 0.8,
   "unit": "-",
   "source": "Maslak 2017 / Rousse 2000 in Campen 2009",
   "doi": "10.23986/afsci.58936",
   "evidence": "measured",
   "verification": "verified-pdf",
   "boundary": "Temperature efficiency; 67-71% measured for a rotary wheel at 81-86% indoor RH, about 80% for a purpose-built counterflow exchanger"
  },
  "moisture_return_fraction": {
   "low": 0.43,
   "base": 0.455,
   "high": 0.48,
   "unit": "-",
   "source": "Maslak 2017",
   "doi": "10.23986/afsci.58936",
   "evidence": "measured",
   "verification": "verified-pdf",
   "boundary": "Parasitic: fraction of removed moisture returned to the supply air by condensate re-evaporating on the rotor. A sensible-recovery figure quoted without this overstates the wheel"
  },
  "capex_area": {
   "low": 3.0,
   "base": 6.2,
   "high": 13.0,
   "unit": "EUR per m2",
   "source": "Rousse 2000; Campen 2003",
   "doi": "10.1016/S1359-4311(99)00048-4",
   "evidence": "costed",
   "verification": "verified-xml",
   "boundary": "Air-to-air heat exchanger for greenhouse dehumidification. Base is Rousse's built prototype at CDN$2000 for a 220 m2 greenhouse, about 6.2 EUR/m2 at 0.68 EUR/CAD. BOUNDARY: the exchanger unit and its fans only; ducting, controls and installation are not itemised. The 3 to 13 EUR/m2 span is Campen's MAXIMUM ALLOWABLE capital on a ten-year payback, which is a budget back-calculated from the energy saving and NOT an observed price - it is carried here as the range because it brackets the one real price, and it is labelled in the text"
  }
 },
 "liquid_desiccant_thermal": {
  "cop_thermal": {
   "low": 0.5,
   "base": 0.62,
   "high": 0.75,
   "unit": "-",
   "source": "Abbas 2025 review",
   "doi": "10.3390/agriengineering7070222",
   "evidence": "cited",
   "verification": "verified-pdf",
   "boundary": "Greenhouse-scale thermally regenerated liquid desiccant. 0.5 solar CaCl2/LiCl Gulf at 60 C regeneration; 0.64-0.74 LiCl/MgCl2 at 35-50 C; 0.75 CaCl2 Netherlands at 80 C"
  },
  "capex_area": {
   "low": 5.9,
   "base": 20.0,
   "high": 41.0,
   "unit": "EUR per m2",
   "source": "Jaradat 2023; Bhowmik 2025",
   "doi": "10.1016/j.jclepro.2023.137587",
   "evidence": "costed",
   "verification": "verified-pdf",
   "boundary": "Two independent greenhouse-scale costings, and they disagree by a factor of seven. Low: Jaradat's itemised design for a 7000 m2 Jordanian greenhouse, 28 absorbers and 7 regenerators plus a solar thermal regenerator, 44510 USD in total, about 5.9 EUR/m2; it includes the CaCl2 salt charge at 200 USD per absorber. High: Bhowmik's 70116 GBP for a 2000 m2 UK greenhouse at 11893 m3/h, about 41 EUR/m2, estimated from a published CAPEX-versus-airflow correlation rather than quoted. The spread is the evidence, and it is reported as such rather than averaged away"
  }
 },
 "liquid_desiccant_nf": {
  "cop_system": {
   "low": 5.3,
   "base": 6.4,
   "high": 7.6,
   "unit": "-",
   "source": "Pasqualin 2024",
   "doi": "10.1016/j.applthermaleng.2024.122495",
   "evidence": "simulated",
   "verification": "verified-pdf",
   "boundary": "Nanofiltration-regenerated liquid desiccant air conditioning, electrically driven, so the heat price does not enter. 7.6 at Colombo and 5.3 at Mecca are the two best locations of seventeen simulated. BOUNDARY: the paper defines COP as cooling power output divided by electric power input, so it is a TOTAL cooling coefficient covering sensible and latent duty together, on the same basis as the cold coil. It must therefore be charged the same (1 + c_sens) burden as the coil, not the latent heat alone. The same paper reports that averaged over all seventeen locations the annual COP is only 1.15 times that of conventional air conditioning, so the best-location figure is not a year-round advantage"
  }
 },
 "solid_desiccant_standalone": {
  "cop_thermal": {
   "low": 0.058,
   "base": 0.21,
   "high": 0.368,
   "unit": "-",
   "source": "Hussain 2022 / Aleem 2020",
   "doi": "10.3390/su14031479;10.3390/en13215530",
   "evidence": "measured",
   "verification": "verified-pdf",
   "boundary": "Standalone solid desiccant air conditioning. Hussain 2022 reports 0.058-0.368; Aleem 2020 reports 0.21-0.24. NOTE: the v1 ranking used 0.35, which is at the very top of this range and flattered the route"
  }
 },
 "solid_desiccant_mcycle": {
  "cop_thermal": {
   "low": 0.36,
   "base": 0.6,
   "high": 0.868,
   "unit": "-",
   "source": "Hussain 2022 / Aleem 2020",
   "doi": "10.3390/su14031479;10.3390/en13215530",
   "evidence": "measured",
   "verification": "verified-pdf",
   "boundary": "Maisotsenko-cycle assisted desiccant air conditioning. Hussain 0.513-0.868; Aleem 0.36-0.47"
  }
 },
 "sorbent_closed_loop": {
  "specific_energy": {
   "low": 6.9,
   "base": 6.9,
   "high": 6.9,
   "unit": "MJ per kg water",
   "source": "Zou 2025",
   "doi": "10.1038/s41467-025-57388-3",
   "evidence": "measured",
   "verification": "verified-pdf",
   "boundary": "Silica gel impregnated with CaCl2, closed-loop greenhouse dehumidifier; water-harvesting coefficient 0.70. Equivalent to SMER 0.52 kg/kWh"
  }
 },
 "thermoelectric": {
  "smer": {
   "low": 0.52,
   "base": 0.52,
   "high": 0.52,
   "unit": "kg per kWh",
   "source": "Han 2025",
   "doi": "10.3390/agronomy15051194",
   "evidence": "measured",
   "verification": "verified-pdf",
   "boundary": "Purpose-built thermoelectric dehumidifier in a Chinese solar greenhouse; dropped RH 25.5 points in 2 h while returning 3.4 K of warming to the air"
  }
 },
 "electrochemical": {
  "cop": {
   "low": 0.33,
   "base": 0.33,
   "high": 0.33,
   "unit": "-",
   "source": "Qi 2017",
   "doi": "10.1016/j.apenergy.2017.09.035",
   "evidence": "measured",
   "verification": "verified-xml",
   "boundary": "Proton-exchange-membrane electrochemical dehumidifier measured on a single laboratory element: only about 30% of the power input was used effectively, the rest lost to back diffusion that ran 2.3 times larger than predicted. BOUNDARY: a laboratory element, not a system, so this is the floor of what the technology does today rather than its ceiling"
  }
 },
 "membrane_amx": {
  "cop_ratio_vs_doas": {
   "low": 1.2,
   "base": 2.9,
   "high": 4.7,
   "unit": "x",
   "source": "Fix 2021",
   "doi": "10.1016/j.apenergy.2021.116950",
   "evidence": "simulated",
   "verification": "verified-xml",
   "boundary": "Active membrane energy exchanger, coefficient of performance relative to a baseline vapour-compression system with heat recovery ventilator (VC-HRV) sized for DEDICATED OUTDOOR AIR, supplying 13 C and 90 % RH against indoor loads of 7.5 kW sensible and 1.54 kW latent; the baseline's own cycle COP runs 2 to 6.3 and falls with outdoor temperature. BOUNDARY TRANSFER when applied to a recirculating greenhouse chiller: the duty and the baseline machine both differ, so the resulting specific energy is indicative of the technology and not comparable with the measured routes. No absolute figure for a built machine is published."
  }
 },
 "refrigerative_field": {
  "smer": {
   "low": 2.0,
   "base": 2.4,
   "high": 3.1,
   "unit": "kg per kWh",
   "source": "Camara-Zapata 2019",
   "doi": "10.1016/j.applthermaleng.2018.09.107",
   "evidence": "measured",
   "verification": "verified-fulltext-xml",
   "boundary": "Measured over a season on a heat-pump dehumidifier in a tomato greenhouse, Almeria. Mean 2.4; the paper also reports COP 2.5, but that COP counts recovered condenser heat as useful output. In a heating-dominated mild-winter greenhouse it is useful; in a hot humid house the same heat is a parasitic load the cooling plant must remove, so only the SMER transfers"
  }
 },
 "prices": {
  "electricity": {
   "low": 0.1,
   "base": 0.15,
   "high": 0.3,
   "unit": "EUR per kWh",
   "source": "assumption",
   "doi": "-",
   "evidence": "assumption",
   "verification": "stated-assumption",
   "boundary": "Range spanning subsidised tropical tariffs to European retail"
  },
  "heat": {
   "low": 0.02,
   "base": 0.04,
   "high": 0.1,
   "unit": "EUR per kWh",
   "source": "assumption",
   "doi": "-",
   "evidence": "assumption",
   "verification": "stated-assumption",
   "boundary": "Low end is waste heat and solar ponds; high end is purchased boiler fuel"
  }
 },
 "dche_heat_pump": {
  "smer": {
   "low": 4.19,
   "base": 4.95,
   "high": 5.7,
   "unit": "kg per kWh",
   "source": "Chai 2020",
   "doi": "10.1016/j.applthermaleng.2020.115742",
   "evidence": "measured",
   "verification": "verified-pdf",
   "boundary": "Moisture removed per unit of TOTAL electricity, wattmeter-measured, on a fresh (outdoor) air duty at 31.91 C / 54.02 % RH / 16.15 g kg-1, which is the ARI humid condition. The air flow sweep gives 4.19 to 5.70 and the cycle-time sweep 4.48 to 5.32; the base is the midpoint of the wider sweep. BOUNDARY: single-pass outdoor air, not recirculated greenhouse air. The inlet humidity ratio is within 5 % of the tropical design point of 17.0 g kg-1 at 26 C and 80 % RH, so the transfer is on-boundary in humidity and 6 K warm in temperature"
  },
  "cop_system": {
   "low": 3.31,
   "base": 4.1,
   "high": 4.52,
   "unit": "-",
   "source": "Chai 2020",
   "doi": "10.1016/j.applthermaleng.2020.115742",
   "evidence": "measured",
   "verification": "verified-pdf",
   "boundary": "System coefficient of performance, total cooling over total electricity, ARI humid condition; 13 to 40 % above the conventional condensation method measured on the same apparatus. Recorded for completeness. The route is SCORED on its SMER, not on this coefficient, because a total-cooling coefficient carries the sensible load and a SMER does not"
  }
 }
};

