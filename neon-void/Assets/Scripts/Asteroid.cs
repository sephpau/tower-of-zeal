using UnityEngine;

public class Asteroid : MonoBehaviour
{
    public float size = 3f;

    void Awake()
    {
        var h = GetComponent<Health>();
        h.OnDeath += OnDeath;
        var rb = GetComponent<Rigidbody>();
        rb.angularVelocity = Random.insideUnitSphere * 0.4f;
    }

    void OnDeath(Health h)
    {
        ExplosionFactory.Explode(transform.position, new Color(1f, 0.65f, 0.3f), size * 0.4f, size > 5f);
        GameManager.I.PlaySfxAt(size > 5f ? SfxSynth.BigBoom : SfxSynth.Boom, transform.position, 0.8f);
        GameManager.I.EnemyKilled(Mathf.RoundToInt(size * 8f), transform.position);
        Powerup.TryDrop(transform.position, 0.08f);
        Destroy(gameObject);
    }
}
