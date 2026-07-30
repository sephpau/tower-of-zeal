using UnityEngine;

// Raycast-stepped projectiles (no tunneling at high speed), pooled.
public class Weapon : MonoBehaviour
{
    public float fireInterval = 0.13f;
    public float projectileSpeed = 220f;
    public float damage = 12f;
    public Color boltColor = new Color(0.3f, 0.9f, 1f);
    public bool isPlayerWeapon = true;
    public Transform[] muzzles;

    float _cooldown;
    int _muzzleIndex;

    void Update() { _cooldown -= Time.deltaTime; }

    public void TryFire()
    {
        if (_cooldown > 0f || muzzles == null || muzzles.Length == 0) return;
        _cooldown = fireInterval;
        var m = muzzles[_muzzleIndex % muzzles.Length];
        _muzzleIndex++;
        Projectile.Spawn(m.position, transform.forward * projectileSpeed, damage, boltColor, gameObject, isPlayerWeapon);
        if (isPlayerWeapon)
        {
            GameManager.I.PlaySfx(SfxSynth.Laser, 0.5f);
            ChaseCamera.Shake(0.04f);
        }
        else GameManager.I.PlaySfxAt(SfxSynth.Laser, m.position, 0.3f);
    }

    // fire toward an arbitrary direction (enemies lead their shots)
    public void FireToward(Vector3 dir)
    {
        if (_cooldown > 0f || muzzles == null || muzzles.Length == 0) return;
        _cooldown = fireInterval;
        var m = muzzles[_muzzleIndex % muzzles.Length];
        _muzzleIndex++;
        Projectile.Spawn(m.position, dir.normalized * projectileSpeed, damage, boltColor, gameObject, isPlayerWeapon);
        GameManager.I.PlaySfxAt(SfxSynth.Laser, m.position, 0.25f);
    }
}
