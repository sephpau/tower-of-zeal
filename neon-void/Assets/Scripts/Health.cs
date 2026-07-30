using System;
using UnityEngine;

public class Health : MonoBehaviour
{
    public float shield, maxShield;
    public float hull, maxHull;
    public float shieldRegenPerSec = 6f;
    public float regenDelay = 4f;
    public bool isPlayer;

    public event Action<Health> OnDeath;
    public event Action<Health, float> OnDamaged;

    float _sinceHit = 99f;
    bool _dead;

    public void Configure(float shieldMax, float hullMax, bool player = false)
    {
        maxShield = shield = shieldMax;
        maxHull = hull = hullMax;
        isPlayer = player;
    }

    void Update()
    {
        _sinceHit += Time.deltaTime;
        if (!_dead && shield < maxShield && _sinceHit > regenDelay)
            shield = Mathf.Min(maxShield, shield + shieldRegenPerSec * Time.deltaTime);
    }

    public void TakeDamage(float amount)
    {
        if (_dead) return;
        _sinceHit = 0f;
        float toShield = Mathf.Min(shield, amount);
        shield -= toShield;
        hull -= (amount - toShield);
        OnDamaged?.Invoke(this, amount);
        if (hull <= 0f)
        {
            _dead = true;
            OnDeath?.Invoke(this);
        }
    }
}
