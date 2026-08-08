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

    // Pocket Drake: absorbs damage before shield/hull; fires when it breaks
    public float absorb;
    public event Action OnAbsorbBroken;

    float _sinceHit = 99f;
    bool _dead;
    float _dmgAccum, _dmgAccumTime;   // batches rapid ticks into one popup

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

        // flush batched damage into a floating number
        if (_dmgAccum > 0f && Time.time - _dmgAccumTime > 0.25f)
            FlushDamagePopup();
    }

    void FlushDamagePopup()
    {
        if (_dmgAccum >= 0.5f && GameManager.I != null)
            GameManager.I.ShowDamage(_dmgAccum, transform.position);
        _dmgAccum = 0f;
    }

    public void TakeDamage(float amount)
    {
        if (_dead) return;
        if (isPlayer)
        {
            var sc = GetComponent<ShipController>();
            if (sc != null && sc.guarding) amount *= 0.5f;   // guard mode halves damage
        }
        _sinceHit = 0f;
        if (absorb > 0f)
        {
            float soaked = Mathf.Min(absorb, amount);
            absorb -= soaked;
            amount -= soaked;
            if (absorb <= 0f) OnAbsorbBroken?.Invoke();
            if (amount <= 0f) return;
        }
        float toShield = Mathf.Min(shield, amount);
        shield -= toShield;
        hull -= (amount - toShield);
        OnDamaged?.Invoke(this, amount);
        if (!isPlayer)
        {
            if (_dmgAccum <= 0f) _dmgAccumTime = Time.time;
            _dmgAccum += amount;
        }
        if (hull <= 0f)
        {
            _dead = true;
            if (!isPlayer) FlushDamagePopup();   // show the killing blow
            OnDeath?.Invoke(this);
        }
    }
}
