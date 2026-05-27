+--------------------------------------------------------------------+
| **SYSTÉM REZERVÁCIÍ AUTOUMYVÁRNE**                                 |
|                                                                    |
| Dokument projektových požiadaviek                                  |
+====================================================================+

  ---------------------------------------------------------------------
  **Verzia**         2 (Návrh)
  ------------------ --------------------------------------------------
  **Stav**           Na pripomienkovanie

  **Cieľová          Manažér autoumyvárne, vývojový tím
  skupina**          

  **Dátum**          13\. mája 2026
  ---------------------------------------------------------------------

# 1. Prehľad

## 1.1 Účel

Interná webová aplikácia, ktorá umožňuje manažérovi autoumyvárne
rezervovať klientov počas telefonického hovoru, dáva pracovníkom
prehľadný pohľad na to, čo a kedy treba umyť, a vedie pre každého
klienta históriu jeho áut a vykonaných služieb. Aplikácia nahrádza
papierové a telefonické rezervácie štruktúrovaným pracovným postupom a
pridáva automatizovanú SMS komunikáciu s klientmi.

## 1.2 Hlavné ciele

- Poskytnúť manažérovi rýchly spôsob, ako prijať rezerváciu počas
  telefonátu s klientom.

- Poskytnúť pracovníkom jasný, aktuálny prehľad denného harmonogramu.

- Vybudovať vyhľadávateľnú históriu každého klienta, jeho áut a
  vykonaných služieb.

- Znížiť počet nedostavení sa a hovorov typu „je už moje auto hotové?"
  pomocou automatických SMS.

## 1.3 Mimo rozsahu 

- Samoobslužná rezervácia pre zákazníkov (cez web alebo aplikáciu).

- Automatický výpočet ceny a integrácia s POS terminálom - odložené
  (pozri časť 12).

- Vernostný program, zľavy - odložené na ďalší rozvoj (pozri časť 12).

- Podpora viacerých prevádzok.

# 2. Hlavné moduly aplikácie

Aplikácia je rozdelená do nasledujúcich funkčných modulov. Pre každý je
nižšie uvedený jeho účel z pohľadu používateľa.

  ---------------------------------------------------------------------
  **Modul**             **Čo modul rieši**
  --------------------- -----------------------------------------------
  **Rezervácie a        Manažér aj pracovníci vidia rozvrh oboch
  kalendár**            umývacích boxov v dennom kalendári. Manažér v
                        ňom vytvára rezervácie počas telefonátu s
                        klientom; pracovníci si v ňom kontrolujú, čo a
                        kedy treba umyť.

  **Klienti a ich       Evidencia klientov vedená podľa telefónneho
  autá**                čísla. Pre každého klienta je možné evidovať
                        viacero áut (ŠPZ, model, typ - sedan, SUV,
                        \...).

  **Služby**            Katalóg ponúkaných služieb (Podľa vytvoreného
                        cenníka od klienta). Manažér ich pri vytváraní
                        objednávky kombinuje a aplikácia z toho
                        automaticky spočíta odhad očakávaného trvania
                        (možnosť manuálne upraviť).

  **Pracovníci a roly** Manažér eviduje pracovníkov a priraďuje ich ku
                        konkrétnym objednávkam.

  **SMS notifikácie**   Automatické SMS klientovi: pripomienka 30 minút
                        pred termínom a oznámenie po dokončení
                        umývania.

  **História služieb**  Pre každé auto kompletná chronologická
                        história: čo bolo umyté, kedy, kým a v akom
                        stave (vrátane zaznamenaných nedostavení sa).

  **Audit log**         Záznam o základných operáciách v systéme - kto
                        vytvoril objednávku, kto zmenil jej stav a
                        kedy.
  ---------------------------------------------------------------------

# 3. Používateľské roly a oprávnenia

V systéme existujú dve roly: manažér a prevádzka (zamestnanci). Tabuľka
nižšie zhŕňa, čo môže ktorá rola robiť.

  ---------------------------------------------------------------------
  **Funkcionalita**                   **Manažér**      **Prevádzka**
  ----------------------------------- ---------------- ----------------
  Zobrazenie kalendára                **Áno**          **Áno**

  Vytvorenie objednávky               **Áno**          **Áno**

  Úprava údajov objednávky (služba,   **Áno**          Nie
  údaje o aute)                                        

  Presunutie času objednávky          **Áno**          Nie

  Vymazanie / zrušenie objednávky     **Áno**          Nie

  Označenie objednávky ako            **Áno**          Nie
  „nedostavil sa"                                      

  Pridanie alebo úprava poznámky k    **Áno**          Nie
  objednávke                                           

  Priradenie pracovníka k objednávke  **Áno**          **Áno**
  (seba aj iného)                                      

  Označenie objednávky ako umytá      **Áno**          **Áno**
  (oranžová)                                           

  Označenie objednávky ako zaplatená  **Áno**          **Áno**
  (zelená)                                             

  Správa katalógu služieb             **Áno**          Nie

  Zobrazenie histórie klienta         **Áno**          **Áno**

  Správa pracovníkov                  **Áno**          Nie
  ---------------------------------------------------------------------

  ----------------------------------------------------------------------
     **AUTENTIFIKÁCIA** Prihlásenie pomocou používateľského mena a
     hesla. Relácia môže byť dlhodobo zachovaná na zdieľanom tablete
     pracovníkov.
  -- -------------------------------------------------------------------

  ----------------------------------------------------------------------

# 4. Postup rezervácie (telefonický hovor)

Manažér prijíma telefonát od klienta a vytvára rezerváciu. Postup musí
plynule fungovať aj na obrazovke telefónu.

1.  **Identifikácia klienta.** Manažér zadá telefónne číslo klienta.

    - Ak číslo zodpovedá existujúcemu klientovi, aplikácia ho načíta a
      zobrazí jeho autá.

    - Ak je číslo nové, aplikácia si vyžiada meno klienta (voliteľné).

2.  **Výber alebo pridanie auta.**

    - Ak má klient v evidencii autá, manažér jedno vyberie.

    - Inak manažér pridá nové auto: ŠPZ, model, typ (sedan, SUV,
      hatchback, pickup, dodávka, iné).

3.  **Výber služieb.**

    - Z preddefinovaného katalógu služieb manažér zaškrtne hlavnú službu
      a prípadné doplnkové služby.

    - Aplikácia automaticky spočíta očakávané trvanie zo súčtu trvaní
      zvolených služieb a typu auta (SUV trvá dlhšie ako sedan - pozri
      časť 9).

4.  **Výber termínu.**

    - Aplikácia navrhne najbližšie voľné termíny v oboch boxoch.

    - Manažér si môže termín vybrať aj manuálne (dátum + čas + box 1
      alebo 2). Aplikácia pri tom kontroluje konflikty.

5.  **(Voliteľne) Pridanie poznámky a priradenie pracovníka.**

6.  **Potvrdenie.** Objednávka sa vytvorí so stavom „vytvorená" (červená
    v kalendári).

  ----------------------------------------------------------------------
     **DÔLEŽITÉ** Telefónne číslo je unikátnym kľúčom klienta. Všetky
     autá a história sa vyhľadávajú podľa neho. Konfliktné rezervácie
     aplikácia neumožní vytvoriť - termín v už obsadenom čase a boxe je
     blokovaný. Presunúť čas existujúcej objednávky môže iba manažér.
  -- -------------------------------------------------------------------

  ----------------------------------------------------------------------

# 5. Zobrazenie kalendára

Kalendár, ktorý zobrazuje rozvrh oboch boxov, podobne ako denný kalendár
v Google alebo Outlooku.

- Dva paralelné stĺpce reprezentujúce Box 1 a Box 2.

- Časová os je vertikálna; každá rezervácia sa zobrazí ako farebný blok
  s veľkosťou podľa svojho trvania.

- **Predvolený pohľad:** denný (na mobile aj na desktope) s možnosťou
  prepnúť na týždenný.

- **Kliknutie na blok** otvorí detail objednávky: klient (meno,
  telefón), auto (ŠPZ, model, typ), služba a trvanie, priradený
  pracovník, poznámka, história klienta, akčné tlačidlá podľa role.

- **Aktualizácie v reálnom čase:** keď jeden používateľ zmení stav,
  ostatné otvorené kalendáre by mali túto zmenu zobraziť bez manuálneho
  obnovenia.

- **Responzivita:** kalendár musí na mobile prepnúť do pohľadu jeden box
  naraz (s prepínačom). Aj formulár vytvorenia rezervácie je plne
  použiteľný na mobile.

## 5.1 Farebné označenie stavov

  ------------------------------------------------------------------------
  **Farba**   **Stav**           **Význam**
  ----------- ------------------ -----------------------------------------
  cervena     **Vytvorená**      Objednávka je zarezervovaná, umývanie
                                 ešte neprebehlo.

  oranzova    **Hotová**         Umývanie dokončené, klient bol upozornený
                                 SMS, že si môže vyzdvihnúť auto.

  zelena      **Zaplatená**      Klient zaplatil a objednávka je uzavretá.

  siva        **Nedostavil sa**  Klient sa nedostavil. Záznam zostáva v
                                 histórii klienta pre potreby manažéra.
  ------------------------------------------------------------------------

# 6. Stavy objednávky a prechody medzi nimi

Postupnosť stavov a pravidlá prechodov:

- **Vytvorená → Hotová:** vykoná manažér alebo pracovník v momente, keď
  je auto umyté. Prechod automaticky odošle SMS „vaše auto je
  pripravené...".

- **Hotová → Zaplatená:** vo Fáze 1 manuálne, iba manažér. V budúcnosti
  tento prechod bude automaticky spúšťať POS terminál (pozri časť 12).

- **Vytvorená → Nedostavil sa:** iba manažér môže označiť objednávku ako
  „klient sa nedostavil". Termín sa uvoľní a záznam sa premietne do
  histórie klienta.

- **Vymazanie objednávky:** manažér môže objednávku vymazať (zrušiť)
  kedykoľvek pred dosiahnutím stavu „zaplatená".

- **Vrátenie stavu:** Po prechode zo stavu Vytvorená sa už do tohto
  stavu nedá rezervácia vrátiť späť.

# 7. Poznámky k objednávkam

Manažér môže ku každej objednávke pridať voľnú textovú poznámku, ktorá
sa zobrazí v detaile objednávky a tak isto v kalendári pri náhľade.
Poznámka je primárne určená na inštrukcie pre pracovníkov.

## 7.1 Pravidlá

- Poznámku môže pridať alebo upraviť iba manažér.

- Pracovníci poznámku vidia, ale nemôžu ju meniť.

- Poznámka sa zobrazuje výrazne v detaile objednávky, aby ju pracovník
  neprehliadol.

- Zmeny poznámky sa zaznamenávajú v audit logu (časť 11).

  ----------------------------------------------------------------------
     **PRÍKLAD** „Klient požiadal, aby sa neotvárala stredová
     konzola." - pracovník túto inštrukciu vidí, ale nemôže ju vymazať
     ani zmeniť.
  -- -------------------------------------------------------------------

  ----------------------------------------------------------------------

#  

# 8. SMS notifikácie

## 8.1 Typy SMS

Aplikácia odosiela dve automatické SMS na objednávku:

- **30-minútová pripomienka.** Odosiela sa automaticky 30 minút pred
  časom začatia. Neodosiela sa, ak už bola objednávka vymazaná.

- **Notifikácia „auto je pripravené".** Odosiela sa v momente, keď
  objednávka prechádza zo stavu „vytvorená" do „hotová" (t. j. keď
  manažér alebo pracovník stlačí tlačidlo „Označiť ako hotové").

**Spoločné požiadavky:**

- Šablóny oboch SMS budú nakonfigurované podľa požiadavky klienta.

- Neúspešné odoslania SMS sa logujú a sú viditeľné v detaile objednávky,
  aby manažér mohol odoslanie zopakovať alebo zavolať klientovi.

- Pri SMS so slovenskou diakritikou je limit 70 znakov na jednu SMS
  (oproti 160 znakov pri SMS bez diakritiky). Šablóny by mali byť
  navrhnuté s ohľadom na tento limit.

## 8.2 Náklady spojené s SMS

Aplikácia bude integrovaná s vybraným najvýhodnejším poskytovateľom SMS.
Náklady na SMS znáša klient.

# 9. Správa služieb

## 9.1 Katalóg služieb

- Katalóg služieb je vopred (staticky) vyplnený vývojovým tímom na
  základe podkladov od klienta pred spustením systému.

- Katalóg obsahuje hlavné služby (napr. umytie exteriéru, umytie
  interiéru) aj doplnkové služby, ktoré predlžujú trvanie objednávky
  (napr. voskovanie, hĺbkové čistenie, čistenie kožených sedadiel).

- Pri vytváraní objednávky manažér zaškrtáva požadované služby a
  aplikácia automaticky spočíta odhad trvania.

- Služby sa dajú označiť ako aktívne alebo neaktívne, ale nikdy sa
  natvrdo nevymazávajú (kvôli zachovaniu integrity histórie).

## 9.2 Trvanie služby a vplyv typu auta

Každá služba má definované základné trvanie v minútach. Toto trvanie
však ovplyvňuje aj typ auta - SUV trvajú dlhšie ako sedan.

  ---------------------------------------------------------------------
  **Služba (príklad)**   **Os. vozidlo** **SUV**
  ---------------------- --------------- ------------------------------
  Umytie exteriéru       45 min          60 min

  Umytie interiéru       60 min          60 min
  ---------------------------------------------------------------------

  ----------------------------------------------------------------------
     **POZNÁMKA** Reálne trvania pre jednotlivé služby a typy sú uvedené
     v cenníku od klienta. Mechanizmus môže byť implementovaný buď
     násobením podľa typu auta, alebo definovaním samostatnej dĺžky pre
     každý typ - upresníme pri implementácii.
  -- -------------------------------------------------------------------

  ----------------------------------------------------------------------

## 9.3 Pridávanie služieb k existujúcim objednávkam

V praxi sa môže stať, že klient počas umývania alebo aj po zaplatení
požiada o doplnkovú službu (napríklad „rovno spravte aj interiér").
Aplikácia musí túto situáciu zvládnuť bez nutnosti vytvárať novú
objednávku.

### Pravidlá:

• Manažér môže pridať službu k objednávke v ľubovoľnom stave -
vytvorená, hotová aj zaplatená.\
• Každá služba na objednávke má vlastný príznak „zaplatené /
nezaplatené".\
• Pôvodne zaplatené služby zostávajú zaplatené; novo pridané služby sú
nezaplatené, kým ich manažér explicitne neoznačí ako zaplatené.\
• Manažér môže službu z objednávky odobrať, ak ešte nebola vykonaná.\
• Pridanie, odobranie aj označenie služby ako zaplatenej sa zaznamenáva
v audit logu.

# 10. Zobrazenie klienta a história

- **Stránka klientov** umožňuje vyhľadávanie podľa telefónneho čísla
  alebo mena.

- **Detail klienta** zobrazuje:

  - Údaje klienta (meno, telefón, voliteľné poznámky).

  - Zoznam všetkých áut klienta.

  - Pre každé auto chronologickú históriu vykonaných služieb - dátum,
    vykonané služby, pracovník, stav (vrátane „nedostavil sa") a
    voliteľná poznámka.

- História je tu len na čítanie; úpravy sa robia v pôvodnej objednávke.

- Kliknutie na blok objednávky v kalendári zobrazí toho istého klienta
  aj jeho históriu.

  ----------------------------------------------------------------------
     **POZNÁMKA** Záznamy o nedostavení sa klienta sú v histórii
     viditeľné, aby si manažér vedel udržať prehľad o spoľahlivosti
     klientov.
  -- -------------------------------------------------------------------

  ----------------------------------------------------------------------

# 

# 11. Audit log a logovanie

Aplikácia vedie základný audit log, aby bolo možné spätne dohľadať, kto
vykonal podstatné operácie a kedy.

## 11.1 Zaznamenané udalosti

- Vytvorenie objednávky (kto a kedy).

- Zmena stavu objednávky (vytvorená → hotová → zaplatená, prípadne
  nedostavil sa) - kto a kedy.

- Vymazanie objednávky.

- Pridanie alebo úprava poznámky k objednávke.

- Zmena priradeného pracovníka.

## 11.2 Prístup a uchovávanie

- Audit log je dostupný iba manažérovi.

- Záznamy sa uchovávajú minimálne 3 mesiace.

# 12. Budúce rozšírenia (Aktuálne mimo rozsahu práce)

Nasledujúce moduly nie sú v rozsahu prvej Fázy, ale počíta sa s nimi pri
ďalšom rozvoji aplikácie. Sú tu zhrnuté preto, aby sme ich pri návrhu
Fázy 1 nezablokovali a aby sme naznačili, aké informácie bude treba pred
ich implementáciou pripraviť.

## 12.1 POS integrácia

Prechod „hotová → zaplatená" je vo Fáze 1 manuálny. Vo Fáze 2 chceme,
aby tento prechod automaticky riadila appka aj s POS terminálom a aby
umožnil aj cenotvorbu pre jednotlivé služby.

**Na zaplánovanie tejto fázy potrebujeme od klienta alebo dodávateľa
POS:**

- Značku a model POS terminálu.

- Či podporuje otvorené API alebo webhooky (a aké protokoly a
  autentifikáciu používa).

- Či dokáže odosielať udalosti o transakciách (položka, suma, časová
  pečiatka, voliteľná referencia).

- Ako majú byť služby spárované s položkami v POS (SKU, voľný text,
  alebo pevná mapovacia tabuľka).

## 12.2 Vernostné karty

Vernostné karty sú plánované ako budúce rozšírenie aplikácie a nie sú
súčasťou Fázy 1. Fungujú ako **predplatený kredit**: klient si na kartu
jednorazovo nabije ľubovoľnou sumou a tú potom postupne čerpá na úhradu
jednotlivých objednávok. Cieľom je motivovať klientov k pravidelnejším
návštevám a získať od nich platbu vopred.

**Predpokladaná funkcionalita:**

- Vernostná karta viazaná na **telefónne číslo klienta** (rovnaký kľúč
  ako evidencia áut a história), bez nutnosti fyzického nosiča.

- Manažér kedykoľvek **dobije kredit** na kartu klienta. zadá sumu,
  ktorú klient zaplatil (hotovosť alebo POS), a tá sa pripíše na
  zostatok.

- Možnosť definovať **zľavu pri platení** napr. 10 % zľava na hlavné
  služby. Zľavy sú konfigurovateľné manažérom.

- **Čerpanie kreditu** pri vytváraní alebo uzatváraní objednávky manažér
  označí, že platba sa má strhnúť z kreditu, a aplikácia odpočíta cenu
  zo zostatku.

- **Zobrazenie zostatku** v detaile klienta a počas vytvárania
  objednávky manažér vidí, koľko ešte kreditu zostáva.

- Ak je zostatok **nižší ako cena objednávky**, aplikácia automaticky
  platbu nedovolí, alebo inak, podľa nastavenia.

  ----------------------------------------------------------------------
     **POZNÁMKA** Po dohode s klientom sa tieto body doplnia do
     samostatnej špecifikácie pre Fázu 2. Implementáciu vernostného
     programu odporúčame riešiť až po nasadení a stabilizácii Fázy 1.
  -- -------------------------------------------------------------------

  ----------------------------------------------------------------------

# 13. Otvorené otázky na upresnenie

  -------------------------------------------------------------------------
  **\#**   **Téma**              **Otázka**
  -------- --------------------- ------------------------------------------
  **1**    **To isté auto, iný   Ak rovnaké ŠPZ raz prinesie klient A a
           vlastník**            inokedy klient B, má sa to evidovať ako
                                 dve nezávislé autá pod dvoma klientmi,
                                 alebo má systém ŠPZ zdieľať medzi
                                 klientmi? Aktuálne predpokladáme druhú
                                 možnosť - treba potvrdiť.

  **2**    **Cenotvorba pred POS Má byť k službám už vo Fáze 1 priradená
           integráciou**         cena (len pre evidenciu, bez výpočtu),
                                 alebo cena príde až spolu s POS
                                 integráciou vo Fáze 2?

  **3**    **Trvanie podľa typu  Každá služba má vlastnú dĺžku pre každý
           auta - mechanizmus**  typ auta (úplná tabuľka), alebo má každá
                                 služba jedno základné trvanie a aplikuje
                                 sa násobiteľ podľa typu (napr. SUV =
                                 1,5×)?

  **4**    **Šablóny SMS -       Dodá klient presné znenia pripomienkovej
           finálne znenia**      SMS aj SMS „auto je pripravené" (vrátane
                                 podpisu / názvu autoumyvárne) pred
                                 spustením systému?
  -------------------------------------------------------------------------

# 14. Nefunkčné požiadavky

  --------------------------------------------------------------------
  **Oblasť**             **Požiadavka**
  ---------------------- ---------------------------------------------
  **Responzívny dizajn** Aplikácia je plne použiteľná na telefónoch
                         (≥360 px) aj na desktopoch. Formulár
                         rezervácie a kalendár sú prioritou pre
                         mobilné UI.

  **Výkon**              Bežné obrazovky (kalendár, detail objednávky,
                         vytvorenie rezervácie) sa otvárajú „okamžite"
                         pri bežnom internetovom pripojení.

  **Dostupnosť**         Aplikácia je potrebná počas otváracích hodín.
                         Cieľ 99 % dostupnosť.

  **Ochrana údajov**     Telefónne čísla a mená klientov sú osobné
                         údaje. Šifrovanie pri prenose (HTTPS) a
                         uchovaní. Spracovanie v súlade s GDPR.

  **Hosting**            Hosting v rámci Európskej únie. Pravidelné
                         automatické zálohy.

  **Lokalizácia**        Aplikácia je výhradne v slovenčine. Štruktúra
                         na viacjazyčnosť nie je v rozsahu Fázy 1.

  **Otváracie hodiny a   Otváracie hodiny pre každý deň v týždni sú
  sviatky**              konfigurovateľné. Sviatky a dni voľna sa
                         rovnako spravujú v nastaveniach manažéra. V
                         kalendári sa zatvorené hodiny zobrazujú
                         zašednuto.

  **Podpora              Posledné dve verzie Chrome, Safari, Firefox a
  prehliadačov**         Edge.
  --------------------------------------------------------------------

# 15. Akceptačné kritériá

Vydanie Fázy 1 sa považuje za hotové, keď sú splnené všetky nasledujúce
kritériá.

  ------------------------------------------------------------------------
  **✓**    **Kritérium**
  -------- ---------------------------------------------------------------
  **1**    Manažér dokáže na telefóne vytvoriť rezerváciu pre existujúceho
           klienta za menej než minútu.

  **2**    Oba boxy sú v kalendári viditeľné súbežne so správnym farebným
           označením všetkých štyroch stavov (vytvorená, hotová,
           zaplatená, nedostavil sa).

  **3**    Aplikácia neumožní vytvoriť konfliktnú rezerváciu (rovnaký box,
           prekrývajúci sa čas).

  **4**    Pracovníci dokážu objednávky zobraziť, aktualizovať stav na
           „hotová" a meniť priradeného pracovníka, ale nemôžu objednávky
           vymazať, presunúť, ani označiť ako „nedostavil sa".

  **5**    Vyhľadanie klienta podľa telefónneho čísla zobrazí všetky jeho
           autá a kompletnú históriu služieb vrátane prípadných
           nedostavení sa.

  **6**    Manažér môže k objednávke pridať poznámku, ktorá je viditeľná
           pracovníkom, ale tí ju nedokážu zmeniť.

  **7**    30-minútová SMS pripomienka aj SMS „auto je pripravené" sa
           odosielajú spoľahlivo a sú logované.

  **8**    Manažér môže objednávku presunúť do stavu „zaplatená" manuálne,
           čo sa v reálnom čase prejaví v každom otvorenom kalendári.

  **9**    Audit log obsahuje záznamy o vytvorení a zmene stavu objednávok
           a o úprave poznámok.

  **10**   Otváracie hodiny a sviatky sú konfigurovateľné a kalendár ich
           rešpektuje.

  **11**   Celý postup funguje na mobile aj na desktope bez rozbitia
           rozloženia.
  ------------------------------------------------------------------------
