using UnityEngine;

// Ramming hurts. Hitting an asteroid costs 10% of max HP (pilots and
// hostiles alike); a pilot/hostile pile-up costs each side 25%. Unity fires
// the collision on BOTH bodies, so the pilot-vs-hostile pair is charged
// from the pilot side only and nobody pays twice. Bosses shrug off rams
// (3%) so a Dreadnought cannot be deleted by bumping into it.
public class CollisionDamage : MonoBehaviour
{
    const float AsteroidPct = 0.10f;
    const float RamPct = 0.25f;
    const float BossRamPct = 0.03f;
    const float Cooldown = 0.6f;
    const float MinImpact = 2f;

    float _last = -9f;

    static bool IsRock(Collider c)
    {
        if (c.GetComponentInParent<Asteroid>() != null) return true;
        string n = c.transform.root.name;
        return n == "asteroid" || n == "totemRock";
    }

    static float MaxPool(Health h) => Mathf.Max(1f, h.maxHull + h.maxShield);

    void OnCollisionEnter(Collision c)
    {
        var gm = GameManager.I;
        if (gm == null || !gm.Running) return;
        if (c.relativeVelocity.magnitude < MinImpact) return;
        if (Time.time - _last < Cooldown) return;
        var me = GetComponent<Health>();
        if (me == null) return;
        bool rock = IsRock(c.collider);
        var other = c.collider.GetComponentInParent<Health>();
        Vector3 at = c.contactCount > 0 ? c.GetContact(0).point : transform.position;

        if (me.isPlayer)
        {
            if (rock)
            {
                _last = Time.time;
                me.TakeDamage(MaxPool(me) * AsteroidPct);
                PlayerFx(at);
            }
            else if (other != null && !other.isPlayer && !other.playerSide && other.GetComponent<EnemyMissile>() == null)
            {
                _last = Time.time;
                me.TakeDamage(MaxPool(me) * RamPct);
                bool boss = other.GetComponent<BossAI>() != null || other.GetComponent<MinibossAI>() != null;
                other.TakeDamage(MaxPool(other) * (boss ? BossRamPct : RamPct));
                PlayerFx(at);
                ExplosionFactory.Sparks(at, new Color(1f, 0.4f, 0.8f));
            }
        }
        else if (rock && !me.playerSide)
        {
            // hostile scraping a rock: the asteroid rule only (rams vs the pilot are charged from the pilot side)
            _last = Time.time;
            me.TakeDamage(MaxPool(me) * AsteroidPct);
            ExplosionFactory.Sparks(at, new Color(1f, 0.7f, 0.3f));
        }
    }

    static void PlayerFx(Vector3 at)
    {
        ExplosionFactory.Sparks(at, new Color(1f, 0.7f, 0.3f));
        ChaseCamera.Shake(0.6f);
        GameManager.I.PlayerHitSfx();
        GameManager.I.FlashDamage();
    }
}
