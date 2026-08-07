using UnityEngine;

public enum PowerupType { Rapid, ShieldCell }

// Drops from kills: drifts in space, magnets to the player when close.
// WeaponUp is a permanent level (max 5); Rapid/Homing are timed; ShieldCell heals.
public class Powerup : MonoBehaviour
{
    public PowerupType type;
    float _life = 22f;
    Transform _player;

    static readonly Color[] Colors = {
        new Color(1f, 0.85f, 0.3f),   // Rapid     — gold
        new Color(0.35f, 0.8f, 1f),   // ShieldCell— cyan
    };

    public static void TryDrop(Vector3 pos, float chance)
    {
        if (Random.value > chance) return;
        PowerupType t = Random.value < 0.45f ? PowerupType.Rapid : PowerupType.ShieldCell;

        var go = new GameObject("powerup-" + t);
        go.transform.position = pos;
        var p = go.AddComponent<Powerup>();
        p.type = t;
        Color c = Colors[(int)t];

        // spinning crystal: two stretched octahedron-ish spheres + glow + light
        var core = NVMeshes.SpherePart(go, NVAssets.Emissive(c, 3.5f), Vector3.zero, new Vector3(0.7f, 1.4f, 0.7f));
        core.name = "core";
        NVMeshes.SpherePart(go, NVAssets.Emissive(c, 2f), Vector3.zero, new Vector3(1.1f, 0.5f, 1.1f));
        var glow = NVAssets.Quad(NVAssets.AdditiveTinted(c), 5f);
        glow.transform.SetParent(go.transform, false);
        glow.AddComponent<Billboard>();
        var l = go.AddComponent<Light>();
        l.type = LightType.Point;
        l.color = c;
        l.range = 14f;
        l.intensity = 2.5f;
    }

    void Start()
    {
        var ship = FindAnyObjectByType<ShipController>();
        if (ship != null) _player = ship.transform;
    }

    void Update()
    {
        _life -= Time.deltaTime;
        if (_life <= 0f) { Destroy(gameObject); return; }

        transform.Rotate(0f, 120f * Time.deltaTime, 0f, Space.World);

        if (_player == null || !GameManager.I.Running) return;
        Vector3 to = _player.position - transform.position;
        float d = to.magnitude;
        if (d < 30f)
            transform.position += to.normalized * Mathf.Lerp(28f, 6f, d / 30f) * Time.deltaTime;
        if (d < 4f)
        {
            GameManager.I.CollectPowerup(type);
            ExplosionFactory.Sparks(transform.position, Colors[(int)type]);
            Destroy(gameObject);
        }
    }
}
