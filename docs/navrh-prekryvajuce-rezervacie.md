# Návrh: povolenie prekrývajúcich sa rezervácií

Momentálne systém **nedovolí** vytvoriť dve rezervácie, ktoré sa v tom istom boxe
prekrývajú v čase. Navrhujeme túto blokáciu uvoľniť. Nižšie je zhrnutie toho,
čo by sa zmenilo — prosím o odsúhlasenie pred realizáciou.

## Čo sa zmení

1. **Rezervácie sa už budú dať prekrývať.** Do toho istého boxu bude možné
  zadať viac áut na rovnaký alebo prekrývajúci sa čas.
2. **Upozornenie pri kolízii (ale dá sa pokračovať).** Keď nový termín zasiahne
  už existujúcu rezerváciu, systém zobrazí upozornenie s konkrétnym termínom,
   napr. *„Prekrýva sa s 11:00–11:30 · BL123AB v Boxe 1 — vytvoriť aj tak?“* a
   po potvrdení rezerváciu vytvorí. Rovnaké potvrdenie sa zobrazí aj pri
   presune termínu, pri pridaní služby, ktorá termín predĺži do ďalšej
   rezervácie, a pri vrátení „nedostavil sa“ späť na aktívnu rezerváciu.  
    
  ANO
3. **Bez obmedzenia počtu.** V jednom boxe sa môže prekrývať ľubovoľný počet
  rezervácií (žiadny strop).  
    
  ANO

1. **Kalendár zobrazí prekrývajúce sa rezervácie vedľa seba.** V rámci boxu sa
  súbežné rezervácie rozdelia do stĺpcov vedľa seba (denné aj týždenné
   zobrazenie). Aby zostali čitateľné (vidno ŠPZ/auto), majú minimálnu šírku —
   ak sa ich zmestí veľa, kalendár sa dá posúvať doľava/doprava.  

2. **Výber času ponúka voľné termíny, ale dovolí vybrať hociktorý.** Pri
  vytváraní rezervácie systém naďalej najprv navrhne voľné okná, no kliknúť sa
   dá na **akýkoľvek** otvorený čas — aj na obsadený (s potvrdením podľa bodu 2).

## Čo zostáva bez zmeny

- **Otváracie hodiny platia naďalej.** Rezerváciu stále nemožno zadať mimo
otváracích hodín ani na zatvorený deň.
- Všetko ostatné (SMS, história, ceny, stavy objednávky) funguje rovnako.
- Chce povolit napriklad pri pridani novej sluzby pre objednavku ktora by presahovala otavaracie hodiny?
  - moznost upozornenia cas prekracuje otvaracie hodiny
  - alebo zakazat?

## Na čo upozorniť

- Zrušením povinnej kontroly **prestane systém automaticky brániť aj náhodnému
dvojitému zadaniu** toho istého termínu. Upozornenie (bod 2) na to upozorní,
ale konečné rozhodnutie je na obsluhe.

---

*Toto je návrh na odsúhlasenie. Po schválení pripravíme presný plán realizácie.*