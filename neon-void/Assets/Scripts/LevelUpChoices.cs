using System.Collections.Generic;
using System.Linq;
using UnityEngine;

// Builds the 3 cards offered on level-up: evolutions (guaranteed when
// available), weapon ranks, new weapons, passives. In tournament mode a
// seeded RNG makes every player's draft identical at each level.
public class LevelUpChoices
{
    public string title, desc, icon;
    System.Action<SkillSystem> _apply;

    public void Apply(SkillSystem s) => _apply(s);

    public static List<LevelUpChoices> Generate(SkillSystem s, System.Random rng = null)
    {
        var evos = new List<LevelUpChoices>();
        var pool = new List<LevelUpChoices>();

        foreach (var ow in s.weapons)
        {
            string id = ow.def.id;
            // evolution: weapon maxed + paired passive owned
            if (ow.level >= ow.def.maxLevel && !ow.evolved && s.passives.ContainsKey(ow.def.evoNeeds))
            {
                evos.Add(new LevelUpChoices {
                    title = "EVOLVE — " + ow.def.evoName,
                    icon = ow.def.evoIcon,
                    desc = ow.def.evoDesc,
                    _apply = sys => sys.Evolve(id),
                });
            }
            else if (ow.level < ow.def.maxLevel)
            {
                pool.Add(new LevelUpChoices {
                    title = ow.DisplayName + "  LV " + (ow.level + 1),
                    icon = ow.DisplayIcon,
                    desc = ow.def.levelUps[Mathf.Clamp(ow.level - 1, 0, ow.def.levelUps.Length - 1)],
                    _apply = sys => sys.LevelWeapon(id),
                });
            }
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

        Shuffle(pool, rng);
        var result = evos.Take(3).ToList();          // evolutions always shown
        result.AddRange(pool.Take(3 - result.Count));
        return result;
    }

    static void Shuffle(List<LevelUpChoices> list, System.Random rng)
    {
        for (int i = list.Count - 1; i > 0; i--)
        {
            int j = rng != null ? rng.Next(i + 1) : Random.Range(0, i + 1);
            (list[i], list[j]) = (list[j], list[i]);
        }
    }
}
