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
    float _missileCooldown;
    int _muzzleIndex;

    public const int MaxLevel = 5;

    void Update()
    {
        _cooldown -= Time.deltaTime;
        if (!isPlayerWeapon) return;

        rapidTimer = Mathf.Max(0f, rapidTimer - Time.deltaTime);
        homingTimer = Mathf.Max(0f, homingTimer - Time.deltaTime);

        // homing missiles launch themselves while active
        _missileCooldown -= Time.deltaTime;
        if (homingTimer > 0f && _missileCooldown <= 0f && GameManager.I.Running)
        {
            var target = Missile.FindTarget(transform.position, 280f);
            if (target != null)
            {
                _missileCooldown = 0.55f;
                Vector3 origin = transform.position + transform.rotation * new Vector3(_muzzleIndex % 2 == 0 ? -1f : 1f, -0.5f, 0f);
                Missile.Launch(origin, transform.forward, target, gameObject);
                GameManager.I.PlaySfx(SfxSynth.Pickup, 0.25f);
            }
        }
    }

    public void TryFire()
    {
        if (_cooldown > 0f || muzzles == null || muzzles.Length == 0) return;
        _cooldown = rapidTimer > 0f ? fireInterval * 0.55f : fireInterval;

        if (!isPlayerWeapon)
        {
            FireOne(muzzles[_muzzleIndex++ % muzzles.Length].position, transform.forward, damage);
            GameManager.I.PlaySfxAt(SfxSynth.Laser, transform.position, 0.3f);
            return;
        }

        // player fire pattern by level
        Vector3 fwd = transform.forward;
        Vector3 left = muzzles[0].position, right = muzzles[1 % muzzles.Length].position;
        Vector3 center = (left + right) * 0.5f;
        switch (Mathf.Clamp(level, 1, MaxLevel))
        {
            case 1:
                FireOne(center, fwd, damage);
                break;
            case 2:
                FireOne(left, fwd, damage);
                FireOne(right, fwd, damage);
                break;
            case 3:
                FireOne(left, fwd, damage);
                FireOne(right, fwd, damage);
                FireOne(center, Spread(fwd, -5f), damage * 0.8f);
                FireOne(center, Spread(fwd, 5f), damage * 0.8f);
                break;
            case 4:
                FireOne(left, fwd, damage);
                FireOne(right, fwd, damage);
                FireOne(left, Spread(fwd, -7f), damage * 0.8f);
                FireOne(right, Spread(fwd, 7f), damage * 0.8f);
                break;
            default:
                FireOne(left, fwd, damage);
                FireOne(right, fwd, damage);
                FireOne(left, Spread(fwd, -7f), damage * 0.8f);
                FireOne(right, Spread(fwd, 7f), damage * 0.8f);
                FireOne(center, fwd, damage * 2.6f);   // heavy center lance
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

    Vector3 Spread(Vector3 fwd, float degrees) =>
        Quaternion.AngleAxis(degrees, transform.up) * fwd;

    void FireOne(Vector3 origin, Vector3 dir, float dmg)
    {
        Projectile.Spawn(origin, dir * projectileSpeed, dmg, boltColor, gameObject, isPlayerWeapon);
    }
}
