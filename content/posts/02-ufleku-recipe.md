---
author: "ripx80"
title: "Ufleku - the desire"
linktitle: "Ufleku"
description: "brewing ufleku clone with recipe as json"
date: 2021-12-29T16:11:02+01:00
draft: false
tags:
  - beer
weight: 0
---

## story

the desire

under the old oak marked by storms, dozing and slumbering towards the afternoon, i suddenly felt an unpleasant sensation in my left ear, at first i thought it was one of those vivid daydreams that haunted me again and again lately, leading me into dark alleys, fleeing from pursuers and dark figures. i ignored it and tried to continue in this peaceful safety of the old oak, listening to the last autumn leaves, to organize my thoughts, how it should go on and especially where.

until the unpleasantness developed, became an almost tangible silhouette and startled me out of my dream with a painful wince. i looked, somewhat blurred and still numb from sleep, into two giant blue glowing eyes. it was garry.
"what the..., what's this about you old bastard?" i gasped, contemptuous and irritated. "bad dream?" replied garry mischievously with a motionless ghostly expression on his face. "can't you let me rest for ten minutes, after all we've been on the road all day. you could also do something sensible with your time for a change and find something to eat."

silently garry squinted at me with his big eyes, "yes i know" i grumbled and slowly rose from my leaden inertia and knocked the damp autumn leaves off my body. laying my head on the back of my neck gazing up at the slowly turning purple, red sky, i realized that i had probably been asleep longer than it seemed in my judgment. "my throat cries out for a smoothly gliding strong drink and there is only one who tries to make this happen in its fullness" garry poetized.

"i know old friend, but it's still quite a way to the big city and i hear there's a gruesome beast up to mischief, a disease from which neither man nor ill-tempered blue-eyed dream robbers are safe". disdainfully garry looked demonstratively in the other direction and confirmed his request by this gesture. "all right you old stinky boot, i wouldn't be averse to a stiff swig of prague ale either. it must also have been two solstices since we last had the opportunity to taste some of this craft from a fresh keg."

without another word, i swung my large jute sack over my right shoulder and marched down the large road that curved through harvested barley and hop fields. garry landed silently on my left shoulder, and so, with the sun's rays dwindling and the balmy autumn breeze brushing the brittle fields like a gentle wet nurse, we trotted toward the tavern, which was located in a valley to the north, hoping there to encounter one of those characters who are powerful in the magic of turning dusty ears of corn into liquid nectar.

## introduction

praha or prague is a amazing city with good tasty beers and bohemian meals. when you ever have the oppertunity to visit europe,eh visit prag.
normaly i visit prag once a year but, you know, at the moment its difficult. one of the expieriences you can make there is to visit local brewey's.
one of them is the traditional **u fleku** restaurant with it's homemade dark beer.

{{< garry "i would so love to get my claws on a whole barrel of this life-giving elixir!" >}}

mhh yes, so what we can do? It's impossible to visit the city without painful limitations.
i have good news to you garry, while i have a impressive flood of new ideas about brewing beer, i created the ufleku clone beer only for you!

{{< garry "estúpido, its copied from m3!" warn>}}

ehhm..., yes garry, you are right.
you can find the clone recipe on [m3](https://www.maischemalzundmehr.de/index.php?inhaltmitte=rezept&id=1225&suche_klonrezepte=ja&factoraw=43&factorsha=62&factorha1=3.5&factorha2=3.5).

we all stand on shoulders, right?. i have done a recipe on my own but this is another story.
when i began to use these recipes in [brewman](https://github.com/ripx80/brewman) it was a mess. if you export the ufleku recipe you will get something like this:

```json
{
    "Name": "U-Fleku Clone",
    "Datum": "04.03.2020",
    "Sorte": "B\u00f6hmisches Lager",
    "Autor": "Kurt",
    "Klonbier": "ja",
    "Klonbier_Original": "U-Fleku",
    "Ausschlagswuerze": 43,
    "Sudhausausbeute": 62,
    "Stammwuerze": 12.5,
    "Bittere": 28,
    "Farbe": "80",
    "Alkohol": 5,
    "Kurzbeschreibung": "Ein B\u00f6hmisches Dunkel nach U-Fleku Art. Leicht r\u00f6stig, vollmundig und hopfenaromatisch.",
    "Infusion_Hauptguss": 30.099999999999998,
    "Malz1": "Pilsner Malz",
    "Malz1_Menge": 4.73,
    "Malz1_Einheit": "kg",
    "Malz2": "M\u00fcnchner Malz",
    "Malz2_Menge": 2.58,
    "Malz2_Einheit": "kg",
    "Malz3": "Caram\u00fcnch II",
    "Malz3_Menge": 1.08,
    "Malz3_Einheit": "kg",
    "Malz4": "Carafa Spezial II",
    "Malz4_Menge": 320,
    "Malz4_Einheit": "g",
    "Maischform": "infusion",
    "Infusion_Einmaischtemperatur": 57,
    "Infusion_Rasttemperatur1": "55",
    "Infusion_Rastzeit1": "10",
    "Infusion_Rasttemperatur2": "62",
    "Infusion_Rastzeit2": "40",
    "Infusion_Rasttemperatur3": "72",
    "Infusion_Rastzeit3": "20"
}
```

whats the problem here? sometimes the types in the json export differs. For example **"Malz1_Menge"** can be a int, float or a string. after the last face lift of m3 i get no errors anymore and all types are consistent. Maybe they fix it but dont trust data from outside.
but this is not the real problem here. if you look to the exported json of this recipe you can see that its problematic to parse and to use in a elegant way. pick out the the structure of **"Infusion_Rastzeit"**.

{{< garry "**Rastzeit** is a german word that means how long you must hold a defined temperature with malts added in your mesh pod. after that you increase to the next rest and at the end go up to 76C and finish the mesh process. you have multiple rests and differrent temperatures on each recipe">}}

try to loop over all rests and print the temperature. the point: you have only a flat structure and must evaluate the keys. keep in mind when you use json you build it for maschines not for humans. it must be simple to parse and has a consist data structure and data types.

let's improve the structure so we can use it without pain:

```json
{
  "Rests": [
    {
      "Temperatur": 55,
      "Time": 10
    },
    {
      "Temperatur": 62,
      "Time": 40
    },
    {
      "Temperatur": 72,
      "Time": 20
    }
  ]
}
```

with this structure you can simple loop over **Rests** without the key generation problem.

With the improvement and the consity of data types in mind i translate the recipes from m3 in my own structure.
at this time yaml was super fancy and k8s and other big project use it, so i try it out. for future projects i use json or toml because i don`t like the overhead of yaml and a interpreter who is bigger than an interpreter of a programming language :-).

{{< garry "oh yet another brew structure, another hero in the wild. why you dont use the default [beerXML](http://beerxml.com/) recipe format?" warn>}}

because i don't like xml. to much overhead and too much fields for my usecase. i want a format which i can use in my brewman factory without pain. i think nobody use my format and the brewman at the moment so i can do what i want :-). if this changes i will think about that, maybe.

for example if you want to translate the ufleku recipe you can do the following:

```sh
brewman recipe ufleku.json > ufleku-struct.yaml
```

after that you have seperated dicts for malts, rests, hops, water and the other interesting informations in a parsable format. no i use the recipe in brewman and start brewing.

```sh
brewman set recipe ufleku-struct.yaml
brewman
```

{{< garry "i love the recipes on m3, how can i convert a bunch of these master pices?" >}}

thats true, thanks for all contributions on this site and the work and love in these recipes!
if you want to have your own local copy off all recipes you can do the following:

```sh
brewman recipes down
```

brewman will fetch all recipes and convert it while it will save the output in recipes folder. you can cancel the process and start it later again. brewman recognize the downloaded recipes and fetch all missing. You can include this in a crontab to fetch periodic all recipes because somethimes some very good will be deleted by users and you have no access anymore to it if you have no local copy.

After 1216 recipes saved to my local disk i recognize that m3 has fixed some of the recipes. in the past many of the recipes have different value types,so its difficult to parse it correctly without a chain of coniditions.
when brewman can not convert it correctly, the broken ones will be saved for manual conversion in the broken folder.
but this time:

```txt
fetch: 1216 doc
broken docs: 0
```

nothing was broken, sunny day! Maybe they fixed the internal structure with the face lift of the site.

## bottling

after i brew 43L of this dark juice i bottled it up in 3.5 boxes and one barrel. in germany one beer box has normaly 20 bottle with 0.5L of each bottle.
and a party barrel has 5L so I have a outcome of 40L finest czech barley juice! not bad.

## conclusion

the first glass tasted malty with a slight caramel note and in the finish still came out very strongly the roast aroma and the bitterness of the hops. But this should evaporate somewhat with the storage of at least one month. All in all, it tastes now already very quaffable and I am very curious how it tastes in the final state.

if you also want to enjoy some of the felling from prague and especially from ufleku, this is the right recipe to make it cozy in your own home. But do not forget, after the meal is a becherovka a must.
