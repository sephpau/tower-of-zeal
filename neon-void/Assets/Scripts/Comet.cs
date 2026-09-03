using System.Collections.Generic;
using UnityEngine;

// Periodic shooting stars: a comet streaks through the battlefield every
// 20-40s, passing near the player. It wrecks whatever it touches — pilots
// take a solid hit, hostiles (and their ordnance) get flattened.
public class CometField : MonoBehaviour
{
    float _timer = 28f;

    void Update()
    {
        var gm = GameManager.I;
        if (gm == null || !gm.Running || gm.Paused || CoopSync.IsGuest) return;
        _timer -= Time.deltaTime;
        if (_timer > 0f) return;
        _timer = Random.Range(20f, 40f);

        var player = gm.Player;
        if (player == null) return;
        Vector3 center = player.transform.position;
        Vector3 dir = Random.onUnitSphere; dir.y *= 0.5f; dir.Normalize();
        Vector3 start = center + dir * 380f;
        // aims NEAR the player, not always through them — dodgeable
        Vector3 aim = center + Random.insideUnitSphere * 45f;
        Vector3 vel = (aim - start).normalized * Random.Range(110f, 150f);
        Comet.Launch(start, vel);
        gm.Hud.WaveBanner("!! COMET !!");
        gm.PlaySfx(SfxSynth.WaveUp, 0.7f);
        Announcer.Say("Comet incoming, clear the lane!", 0.6f, 1f);
    }
}

public class Comet : MonoBehaviour
{
    const float Radius = 5f;
    const float PlayerDamage = 38f;
    const float HostileDamage = 260f;

    Vector3 _vel;
    float _life = 9f;
    readonly HashSet<Health> _hit = new HashSet<Health>();
    Transform _head;

    public static void Launch(Vector3 pos, Vector3 vel)
    {
        var go = new GameObject("comet");
        go.transform.position = pos;
        var c = go.AddComponent<Comet>();
        c._vel = vel;

        var ice = new Color(0.8f, 0.95f, 1f);
        var headGo = new GameObject("head");
        headGo.transform.SetParent(go.transform, false);
        NVMeshes.SpherePart(headGo, NVAssets.Emissive(ice, 3.2f), Vector3.zero, Vector3.one * 3.2f);
        NVMeshes.SpherePart(headGo, NVAssets.Standard(new Color(0.55f, 0.5f, 0.6f), 0.6f, 0.3f), new Vector3(0.6f, 0.4f, 0f), Vector3.one * 2.4f);
        c._head = headGo.transform;

        var glow = NVAssets.Quad(NVAssets.AdditiveTinted(new Color(0.6f, 0.85f, 1f)), 14f);
        glow.transform.SetParent(go.transform, false);
        glow.AddComponent<Billboard>();

        var trail = go.AddComponent<TrailRenderer>();
        trail.time = 1.6f;
        trail.startWidth = 4.5f;
        trail.endWidth = 0.2f;
        trail.material = NVAssets.Additive;
        trail.startColor = new Color(0.7f, 0.9f, 1f, 0.9f);
        trail.endColor = new Color(0.4f, 0.5f, 1f, 0f);
        trail.minVertexDistance = 1f;

        var light = new GameObject("light").AddComponent<Light>();
        light.transform.SetParent(go.transform, false);
        light.type = LightType.Point;
        light.color = ice;
        light.intensity = 5f;
        light.range = 45f;
    }

    void Update()
    {
        var gm = GameManager.I;
        if (gm == null || !gm.Running) { Destroy(gameObject); return; }
        _life -= Time.deltaTime;
        if (_life <= 0f) { Destroy(gameObject); return; }

        transform.position += _vel * Time.deltaTime;
        if (_head != null) _head.Rotate(90f * Time.deltaTime, 140f * Time.deltaTime, 0f, Space.Self);

        foreach (var col in Physics.OverlapSphere(transform.position, Radius))
        {
            var h = col.GetComponentInParent<Health>();
            if (h == null || _hit.Contains(h)) continue;
            _hit.Add(h);
            if (h.isPlayer)
            {
                h.TakeDamage(PlayerDamage);
                gm.FlashDamage();
                gm.PlayerHitSfx();
                ChaseCamera.Shake(0.7f);
            }
            else if (!h.playerSide)
            {
                h.TakeDamage(HostileDamage);
            }
            else continue;
            ExplosionFactory.Explode(h.transform.position, new Color(0.7f, 0.9f, 1f), 1.6f, false);
            gm.PlaySfxAt(SfxSynth.Boom, h.transform.position, 0.8f);
        }
    }
}
