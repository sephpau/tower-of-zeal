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

    public int level = 1;               // player only, 1..5
    public float rapidTimer;            // seconds of rapid fire left
    public float homingTimer;           // seconds of homing missiles left

    float _cooldown;
    int _muzzleIndex;

    public const int MaxLevel = 5;

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

        // straight pulse fire only — levels add damage, twin barrels from LV2
        Vector3 fwd = transform.forward;
        Vector3 left = muzzles[0].position, right = muzzles[1 % muzzles.Length].position;
        float dmg = damage * (1f + 0.15f * (Mathf.Clamp(level, 1, MaxLevel) - 1));
        if (level >= 2)
        {
            FireOne(left, fwd, dmg);
            FireOne(right, fwd, dmg);
        }
        else
            FireOne((left + right) * 0.5f, fwd, dmg);
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
            return _skillsRef != null ? _skillsRef.DamageMult : 1f;
        }
    }

    void FireOne(Vector3 origin, Vector3 dir, float dmg)
    {
        if (isPlayerWeapon) dmg *= PlayerDmgMult;
        Projectile.Spawn(origin, dir * projectileSpeed, dmg, boltColor, gameObject, isPlayerWeapon);
    }
}
