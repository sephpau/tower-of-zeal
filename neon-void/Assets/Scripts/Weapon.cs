using UnityEngine;

// Player weapon has permanent levels 1..5 (from WeaponUp drops) plus timed
// Rapid and Homing modes. Enemies use it as a simple single-barrel gun.
public class Weapon : MonoBehaviour
{
    public float fireInterval = 0.13f;
    public float projectileSpeed = 220f;
    public float damage = 12f;
    public Color boltColor = new Color(0.3f, 0.9f, 1f);
    public bool isPlayerWeapon = true;
    public Transform[] muzzles;

    public int sigilLevel = 1;          // player only, 1..6 — advances on the run clock
    public float rapidTimer;            // seconds of rapid fire left
    public float homingTimer;           // legacy, unused

    float _cooldown;
    int _muzzleIndex;

    public const int MaxSigil = 6;

    void Update()
    {
        _cooldown -= Time.deltaTime;
        if (!isPlayerWeapon) return;
        rapidTimer = Mathf.Max(0f, rapidTimer - Time.deltaTime);
    }

    public void TryFire()
    {
        if (_cooldown > 0f || muzzles == null || muzzles.Length == 0) return;
        float statCd = 1f;
        if (isPlayerWeapon)
        {
            var skills = GetComponent<SkillSystem>();
            if (skills != null) statCd = skills.CooldownMult;
        }
        _cooldown = (rapidTimer > 0f ? fireInterval * 0.55f : fireInterval) * statCd;

        if (!isPlayerWeapon)
        {
            FireOne(muzzles[_muzzleIndex++ % muzzles.Length].position, transform.forward, damage);
            GameManager.I.PlaySfxAt(SfxSynth.Laser, transform.position, 0.3f);
            return;
        }

        // Zeal Sigil patterns — grows on the run clock
        Vector3 fwd = transform.forward;
        Vector3 up = transform.up, right = transform.right;
        Vector3 lp = muzzles[0].position, rp = muzzles[1 % muzzles.Length].position;
        Vector3 center = (lp + rp) * 0.5f;
        Vector3 slantL = Quaternion.AngleAxis(-6f, up) * fwd;
        Vector3 slantR = Quaternion.AngleAxis(6f, up) * fwd;
        float dmg = damage;

        switch (Mathf.Clamp(sigilLevel, 1, MaxSigil))
        {
            case 1:   // one straight pulse
                FireOne(center, fwd, dmg);
                break;
            case 2:   // two straight
                FireOne(lp, fwd, dmg);
                FireOne(rp, fwd, dmg);
                break;
            case 3:   // two slanted + one straight middle
                FireOne(lp, slantL, dmg);
                FireOne(rp, slantR, dmg);
                FireOne(center, fwd, dmg);
                break;
            case 4:   // two slanted + two straight middle
                FireOne(lp, slantL, dmg);
                FireOne(rp, slantR, dmg);
                FireOne(center - right * 0.7f, fwd, dmg);
                FireOne(center + right * 0.7f, fwd, dmg);
                break;
            case 5:   // two slanted + triangle formation
                FireOne(lp, slantL, dmg);
                FireOne(rp, slantR, dmg);
                FireOne(center + up * 0.8f, fwd, dmg);
                FireOne(center - right * 0.8f - up * 0.5f, fwd, dmg);
                FireOne(center + right * 0.8f - up * 0.5f, fwd, dmg);
                break;
            default:  // two slanted + box formation
                FireOne(lp, slantL, dmg);
                FireOne(rp, slantR, dmg);
                FireOne(center - right * 0.8f + up * 0.7f, fwd, dmg);
                FireOne(center + right * 0.8f + up * 0.7f, fwd, dmg);
                FireOne(center - right * 0.8f - up * 0.7f, fwd, dmg);
                FireOne(center + right * 0.8f - up * 0.7f, fwd, dmg);
                break;
        }
        GameManager.I.PlaySfx(SfxSynth.Laser, 0.5f);
        ChaseCamera.Shake(0.04f);
    }

    public void FireToward(Vector3 dir)
    {
        if (_cooldown > 0f || muzzles == null || muzzles.Length == 0) return;
        _cooldown = fireInterval;
        FireOne(muzzles[_muzzleIndex++ % muzzles.Length].position, dir.normalized, damage);
        GameManager.I.PlaySfxAt(SfxSynth.Laser, transform.position, 0.25f);
    }

    SkillSystem _skillsRef;
    bool _skillsChecked;
    float PlayerDmgMult
    {
        get
        {
            if (!_skillsChecked) { _skillsRef = GetComponent<SkillSystem>(); _skillsChecked = true; }
            float m = _skillsRef != null ? _skillsRef.DamageMult : 1f;
            var acts = GetComponent<ActiveSkills>();
            if (acts != null) m *= acts.DamageBuffMult;
            return m;
        }
    }

    void FireOne(Vector3 origin, Vector3 dir, float dmg)
    {
        if (isPlayerWeapon) dmg *= PlayerDmgMult;
        Projectile.Spawn(origin, dir * projectileSpeed, dmg, boltColor, gameObject, isPlayerWeapon);
    }
}
