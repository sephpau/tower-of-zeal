using UnityEngine;

// One-shot particle explosions + impact sparks, configured entirely in code.
public static class ExplosionFactory
{
    public static void Explode(Vector3 pos, Color color, float scale = 1f, bool big = false)
    {
        Burst(pos, color, big ? 90 : 40, 14f * scale, 0.9f, 1.6f * scale);
        Burst(pos, Color.white, big ? 25 : 10, 6f * scale, 0.35f, 0.9f * scale);
        Flash(pos, color, 6f * scale);
        if (big) ChaseCamera.Shake(0.7f);
    }

    public static void Sparks(Vector3 pos, Color color)
    {
        Burst(pos, color, 8, 7f, 0.3f, 0.5f);
    }

    static void Burst(Vector3 pos, Color color, int count, float speed, float life, float size)
    {
        var go = new GameObject("burst");
        go.transform.position = pos;
        var ps = go.AddComponent<ParticleSystem>();
        var main = ps.main;
        main.duration = life;
        main.loop = false;
        main.startLifetime = new ParticleSystem.MinMaxCurve(life * 0.4f, life);
        main.startSpeed = new ParticleSystem.MinMaxCurve(speed * 0.3f, speed);
        main.startSize = new ParticleSystem.MinMaxCurve(size * 0.4f, size);
        main.startColor = color;
        main.simulationSpace = ParticleSystemSimulationSpace.World;
        main.maxParticles = count + 8;

        var emission = ps.emission;
        emission.rateOverTime = 0;
        emission.SetBursts(new[] { new ParticleSystem.Burst(0f, (short)count) });

        var shape = ps.shape;
        shape.shapeType = ParticleSystemShapeType.Sphere;
        shape.radius = 0.3f;

        var col = ps.colorOverLifetime;
        col.enabled = true;
        var grad = new Gradient();
        grad.SetKeys(
            new[] { new GradientColorKey(Color.white, 0f), new GradientColorKey(color, 0.3f), new GradientColorKey(color * 0.5f, 1f) },
            new[] { new GradientAlphaKey(1f, 0f), new GradientAlphaKey(0.8f, 0.4f), new GradientAlphaKey(0f, 1f) });
        col.color = grad;

        var sz = ps.sizeOverLifetime;
        sz.enabled = true;
        sz.size = new ParticleSystem.MinMaxCurve(1f, AnimationCurve.Linear(0, 1, 1, 0.1f));

        var r = go.GetComponent<ParticleSystemRenderer>();
        r.material = NVAssets.Additive;
        r.renderMode = ParticleSystemRenderMode.Billboard;

        ps.Play();
        Object.Destroy(go, life + 0.5f);
    }

    static void Flash(Vector3 pos, Color color, float range)
    {
        var go = new GameObject("flash");
        go.transform.position = pos;
        var l = go.AddComponent<Light>();
        l.type = LightType.Point;
        l.color = color;
        l.intensity = 6f;
        l.range = range * 3f;
        go.AddComponent<LightFader>();
        Object.Destroy(go, 0.4f);
    }
}

public class LightFader : MonoBehaviour
{
    void Update()
    {
        var l = GetComponent<Light>();
        if (l != null) l.intensity = Mathf.Max(0, l.intensity - Time.deltaTime * 18f);
    }
}
