using System.Collections.Generic;
using System.Linq;
using UnityEngine;

// Level-up draft, one skill point per level (levels 2-10 = 9 points):
//  even levels (2,4,6,8,10) — pick a passive rank (Keg / Grog / Lodestone)
//  odd levels  (3,5,7,9)    — learn one of 3 random active skills (keys 1-4)
// In tournament mode a seeded RNG makes every player's draft identical.
public class LevelUpChoices
{
    public string title, desc, icon;
    public Sprite sprite;
    System.Action _apply;

    public void Apply(SkillSystem s) => _apply();

    public static List<LevelUpChoices> Generate(int level, SkillSystem s, ActiveSkills acts, System.Random rng = null)
    {
        bool passiveLevel = level % 2 == 0;
        var result = passiveLevel ? PassiveCards(s) : ActiveCards(acts, rng);
        // fallback so a skill point is never wasted
        if (result.Count == 0) result = passiveLevel ? ActiveCards(acts, rng) : PassiveCards(s);
        return result;
    }

    static List<LevelUpChoices> PassiveCards(SkillSystem s)
    {
        var cards = new List<LevelUpChoices>();
        foreach (var def in ZealData.Passives)
        {
            int cur = s.PassiveLevel(def.id);
            if (cur >= ZealData.PassiveMaxLevel) continue;
            string id = def.id;
            bool mastery = cur + 1 >= ZealData.PassiveMaxLevel;
            cards.Add(new LevelUpChoices {
                title = def.name + "  LV " + (cur + 1),
                icon = def.icon,
                sprite = SkillIcons.Passive(def.id, cur + 1),
                desc = def.tierDesc[cur] + (mastery ? "\nMASTERY: +10% xp, dmg, hp, speed" : ""),
                _apply = () => s.AddPassive(id),
            });
        }
        return cards;
    }

    static List<LevelUpChoices> ActiveCards(ActiveSkills acts, System.Random rng)
    {
        var cards = new List<LevelUpChoices>();
        if (acts == null || acts.slots.Count >= ZealData.MaxActives) return cards;
        var pool = ZealData.Actives.Where(a => !acts.Knows(a.id)).ToList();
        Shuffle(pool, rng);
        foreach (var def in pool.Take(3))
        {
            string id = def.id;
            int key = acts.slots.Count + 1;
            cards.Add(new LevelUpChoices {
                title = "LEARN — " + def.name,
                icon = def.abbrev,
                sprite = SkillIcons.Active(def.id),
                desc = def.desc + "\nKey [" + key + "] · " + def.cooldown + "s cooldown",
                _apply = () => acts.Learn(id),
            });
        }
        return cards;
    }

    static void Shuffle<T>(List<T> list, System.Random rng)
    {
        for (int i = list.Count - 1; i > 0; i--)
        {
            int j = rng != null ? rng.Next(i + 1) : Random.Range(0, i + 1);
            (list[i], list[j]) = (list[j], list[i]);
        }
    }
}
