using System.Collections.Generic;
using System.Linq;
using UnityEngine;

// Builds the 3 cards offered on level-up: new weapons, weapon ranks,
// new passives, passive ranks — mirroring the Zeal Survivors pool.
public class LevelUpChoices
{
    public string title, desc, icon;
    System.Action<SkillSystem> _apply;

    public void Apply(SkillSystem s) => _apply(s);

    public static List<LevelUpChoices> Generate(SkillSystem s)
    {
        var pool = new List<LevelUpChoices>();

        foreach (var ow in s.weapons.Where(w => w.level < w.def.maxLevel))
        {
            string id = ow.def.id;
            pool.Add(new LevelUpChoices {
                title = ow.def.name + "  LV " + (ow.level + 1),
                icon = ow.def.icon,
                desc = ow.def.levelUps[Mathf.Clamp(ow.level - 1, 0, ow.def.levelUps.Length - 1)],
                _apply = sys => sys.LevelWeapon(id),
            });
        }

        if (s.weapons.Count < ZealData.MaxWeaponSlots)
        {
            foreach (var def in ZealData.Weapons.Values.Where(w => !s.HasWeapon(w.id)))
            {
                string id = def.id;
                pool.Add(new LevelUpChoices {
                    title = "NEW — " + def.name,
                    icon = def.icon,
                    desc = def.desc,
                    _apply = sys => sys.AddWeapon(id),
                });
            }
        }

        foreach (var p in ZealData.Passives)
        {
            int cur = s.passives.TryGetValue(p.id, out int v) ? v : 0;
            if (cur >= p.maxLevel) continue;
            if (cur == 0 && s.passives.Count >= ZealData.MaxPassiveSlots) continue;
            string id = p.id;
            pool.Add(new LevelUpChoices {
                title = (cur == 0 ? "NEW — " : "") + p.name + (cur > 0 ? "  RANK " + (cur + 1) : ""),
                icon = p.icon,
                desc = p.desc,
                _apply = sys => sys.AddPassive(id),
            });
        }

        // shuffle, take 3
        for (int i = pool.Count - 1; i > 0; i--)
        {
            int j = Random.Range(0, i + 1);
            (pool[i], pool[j]) = (pool[j], pool[i]);
        }
        return pool.Take(3).ToList();
    }
}
