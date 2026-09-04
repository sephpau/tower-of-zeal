using System.Collections;
using UnityEngine;

// THE DECIMATION: a 5-minute arena with unlimited lives. A Doom Totem
// drops in periodically; whoever claims it becomes the DECIMATOR for 30s:
// doubled size, red aura, max sigil, full stats and a fresh hull. Score is
// kills; deaths only matter as the K/D tiebreaker.
public static class DecimationMode
{
    public const float Duration = 300f;
    public const float DecimatorTime = 30f;
    const string BestKey = "zsv2-decim-best";

    public static bool Pending;   // chosen on the homepage, applied at StartRun
    public static bool Active;
    public static int Deaths;

    public static int BestKills => PlayerPrefs.GetInt(BestKey, 0);
    public static float KD => Deaths == 0 ? RunStats.kills : (float)RunStats.kills / Deaths;

    public static void Arm() { Active = true; Pending = false; Deaths = 0; }

    public static void RecordBest()
    {
        if (RunStats.kills > BestKills) { PlayerPrefs.SetInt(BestKey, RunStats.kills); PlayerPrefs.Save(); }
    }
}

public class DecimationRunner : MonoBehaviour
{
    float _elapsed, _spawnTimer, _totemTimer, _eliteTimer, _decimatorLeft = -1f;
    bool _wasRunning;
    GameObject _totem, _totemRock, _aura;

    // saved baseline for the Decimator power-up
    Vector3 _savedScale;
    float _savedMight, _savedCd, _savedSpeed, _savedMaxHull, _savedMaxShield;
    int _savedSigil;

    void ResetState()
    {
        _elapsed = 0f;
        _spawnTimer = 2.5f;
        _totemTimer = 18f;
        _eliteTimer = 50f;
        _decimatorLeft = -1f;
        if (_totem != null) Destroy(_totem);
        if (_totemRock != null) Destroy(_totemRock);
        if (_aura != null) Destroy(_aura);
    }

    void Update()
    {
        var gm = GameManager.I;
        if (gm == null) return;
        if (!_wasRunning && gm.Running && DecimationMode.Active) ResetState();
        _wasRunning = gm.Running;
        if (!DecimationMode.Active || !gm.Running || gm.Paused) return;

        var player = gm.Player;
        if (player == null) return;
        float dt = Time.deltaTime;
        _elapsed += dt;
        float left = DecimationMode.Duration - _elapsed;
        gm.Hud.SetTimer(left);
        if (left <= 0f)
        {
            EndDecimator();
            gm.DecimationOver();
            return;
        }

        Vector3 center = player.transform.position;
        int minute = 1 + (int)(_elapsed / 60f);

        // relentless horde, thickening every minute
        _spawnTimer -= dt;
        if (_spawnTimer <= 0f)
        {
            _spawnTimer = Mathf.Max(0.9f, 2.4f - minute * 0.25f);
            Vector3 d = Random.onUnitSphere; d.y *= 0.5f;
            Vector3 p = center + d.normalized * Random.Range(120f, 170f);
            if (Random.value < 0.25f) EnemyFactory.BuildGunship(p, minute + 2);
            else EnemyFactory.BuildInterceptor(p, minute + 2);
        }
        _eliteTimer -= dt;
        if (_eliteTimer <= 0f)
        {
            _eliteTimer = 50f;
            Vector3 d = Random.onUnitSphere; d.y *= 0.5f;
            EnemyFactory.BuildElite(center + d.normalized * 150f, minute + 3);
            gm.Hud.WaveBanner("!! ELITE HUNTER !!");
        }

        // the Doom Totem
        _totemTimer -= dt;
        if (_totem == null && _totemRock == null && _totemTimer <= 0f) SpawnTotem(center);
        if (_totem != null)
        {
            _totem.transform.Rotate(0f, 70f * dt, 0f, Space.World);
            float pulse = 1f + 0.12f * Mathf.Sin(Time.time * 5f);
            _totem.transform.localScale = Vector3.one * pulse;
            if (Vector3.Distance(center, _totem.transform.position) < 8f)
            {
                ExplosionFactory.Explode(_totem.transform.position, new Color(1f, 0.15f, 0.1f), 2.2f, true);
                Destroy(_totem);
                _totem = null;
                _totemTimer = 40f;
                BecomeDecimator();
            }
        }

        if (_decimatorLeft > 0f)
        {
            _decimatorLeft -= dt;
            if (_aura != null) _aura.transform.Rotate(0f, 0f, 120f * dt, Space.Self);
            if (_decimatorLeft <= 0f) EndDecimator();
        }
    }

    // the totem is buried in a rock: find the one seeping red and crack it open
    void SpawnTotem(Vector3 center)
    {
        var gm = GameManager.I;
        Vector3 d = Random.onUnitSphere; d.y *= 0.4f;
        float size = 9f;
        _totemRock = new GameObject("totemRock");
        _totemRock.transform.position = center + d.normalized * Random.Range(70f, 110f);
        _totemRock.transform.rotation = Random.rotation;
        _totemRock.transform.localScale = Vector3.one * size;
        _totemRock.AddComponent<MeshFilter>().sharedMesh = NVAssets.RockMesh(4242);
        _totemRock.AddComponent<MeshRenderer>().sharedMaterial = NVAssets.Rock;
        var col = _totemRock.AddComponent<SphereCollider>();
        col.radius = 0.85f;
        var rb = _totemRock.AddComponent<Rigidbody>();
        rb.useGravity = false;
        rb.mass = size * 4f;
        rb.angularVelocity = Random.insideUnitSphere * 0.3f;
        var h = _totemRock.AddComponent<Health>();
        h.Configure(0f, 160f);
        // a faint red seep gives it away to a sharp eye
        var seep = new GameObject("seep").AddComponent<Light>();
        seep.transform.SetParent(_totemRock.transform, false);
        seep.type = LightType.Point;
        seep.color = new Color(1f, 0.15f, 0.1f);
        seep.intensity = 3f;
        seep.range = 30f;
        h.OnDeath += _ =>
        {
            var rock = _totemRock;
            _totemRock = null;
            Vector3 at = rock != null ? rock.transform.position : center;
            ExplosionFactory.Explode(at, new Color(1f, 0.65f, 0.3f), 3.5f, true);
            gm.PlaySfxAt(SfxSynth.BigBoom, at, 0.9f);
            if (rock != null) Destroy(rock);
            RevealTotem(at);
        };
        gm.Hud.WaveBanner("!! A DOOM TOTEM HIDES IN A NEARBY ASTEROID !!");
        gm.PlaySfx(SfxSynth.WaveUp, 0.6f);
        Announcer.Say("A Doom Totem lies buried in a nearby asteroid. Crack it open!", 0.6f, 0.95f);
    }

    // the rock is dust: Dr. Ego von Doom stands revealed, ready to be claimed
    void RevealTotem(Vector3 pos)
    {
        var gm = GameManager.I;
        var red = new Color(1f, 0.12f, 0.1f);
        _totem = new GameObject("doomTotem");
        _totem.transform.position = pos;
        var prefab = Resources.Load<GameObject>("decimation/doom_totem");
        if (prefab != null)
        {
            var model = Instantiate(prefab, _totem.transform);
            var rends = model.GetComponentsInChildren<Renderer>();
            if (rends.Length > 0)
            {
                var b = rends[0].bounds;
                foreach (var r in rends) b.Encapsulate(r.bounds);
                float tall = Mathf.Max(b.size.x, b.size.y, b.size.z);
                if (tall > 0.0001f) model.transform.localScale *= 10f / tall;
                b = rends[0].bounds;
                foreach (var r in rends) b.Encapsulate(r.bounds);
                model.transform.position += _totem.transform.position - b.center;
            }
            // extracted embedded textures land under decimation/tex with the FBX author's
            // names, so take the best-looking candidate rather than guessing a filename
            Texture2D tex = null;
            foreach (var t in Resources.LoadAll<Texture2D>("decimation/tex"))
            {
                string n = t.name.ToLowerInvariant();
                if (tex == null || n.Contains("base") || n.Contains("color") || n.Contains("albedo") || n.Contains("diffuse")) tex = t;
            }
            foreach (var r in rends)
                foreach (var m in r.materials)
                {
                    if (tex != null && m.mainTexture == null) { m.mainTexture = tex; m.color = Color.white; }
                    if (m.mainTexture == null)
                    {
                        // embedded texture lost on import: brand it in doom red instead
                        m.color = new Color(0.55f, 0.08f, 0.08f);
                        if (m.HasProperty("_EmissionColor")) { m.EnableKeyword("_EMISSION"); m.SetColor("_EmissionColor", red * 0.6f); }
                    }
                }
            foreach (var c in model.GetComponentsInChildren<Collider>()) Destroy(c);
        }
        else
        {
            var pillar = GameObject.CreatePrimitive(PrimitiveType.Cube);
            Destroy(pillar.GetComponent<Collider>());
            pillar.transform.SetParent(_totem.transform, false);
            pillar.transform.localScale = new Vector3(2.2f, 9f, 2.2f);
            pillar.GetComponent<MeshRenderer>().sharedMaterial = NVAssets.Emissive(red, 2.8f);
        }
        var glow = NVAssets.Quad(NVAssets.AdditiveTinted(red), 26f);
        glow.transform.SetParent(_totem.transform, false);
        glow.AddComponent<Billboard>();
        var light = new GameObject("light").AddComponent<Light>();
        light.transform.SetParent(_totem.transform, false);
        light.type = LightType.Point;
        light.color = red;
        light.intensity = 6f;
        light.range = 60f;
        gm.Hud.WaveBanner("!! DOOM TOTEM REVEALED !!");
        gm.PlaySfx(SfxSynth.BigBoom, 0.7f);
        Announcer.Say("The Doom Totem is exposed. Claim it!", 0.6f, 0.95f);
    }

    void BecomeDecimator()
    {
        var gm = GameManager.I;
        var h = gm.Player;
        var sk = gm.Skills;
        var w = h.GetComponent<Weapon>();
        if (_decimatorLeft > 0f) { _decimatorLeft = DecimationMode.DecimatorTime; return; }   // re-claim: refresh the timer

        _savedScale = h.transform.localScale;
        h.transform.localScale = _savedScale * 2f;
        if (sk != null)
        {
            _savedMight = sk.stats["might"]; sk.stats["might"] += 1.5f;
            _savedCd = sk.stats["cooldown"]; sk.stats["cooldown"] += 0.4f;
            _savedSpeed = sk.stats["speed"]; sk.stats["speed"] += 0.35f;
        }
        if (w != null) { _savedSigil = w.sigilLevel; w.sigilLevel = Weapon.MaxSigil; }
        _savedMaxHull = h.maxHull; _savedMaxShield = h.maxShield;
        h.maxHull *= 20f; h.maxShield *= 20f;   // Decimator: HP and shield (mana) x20
        h.hull = h.maxHull; h.shield = h.maxShield;

        var red = new Color(1f, 0.15f, 0.1f);
        _aura = new GameObject("decimatorAura");
        _aura.transform.SetParent(h.transform, false);
        var q = NVAssets.Quad(NVAssets.AdditiveTinted(red), 9f);
        q.transform.SetParent(_aura.transform, false);
        q.AddComponent<Billboard>();
        var l = new GameObject("light").AddComponent<Light>();
        l.transform.SetParent(_aura.transform, false);
        l.type = LightType.Point;
        l.color = red;
        l.intensity = 7f;
        l.range = 45f;

        _decimatorLeft = DecimationMode.DecimatorTime;
        gm.Hud.WaveBanner("!! YOU ARE THE DECIMATOR !!");
        gm.PlaySfx(SfxSynth.BigBoom, 1f);
        gm.PlaySfx(SfxSynth.WaveUp, 1f);
        ChaseCamera.Shake(0.8f);
        Announcer.Say("You are the Decimator! Thirty seconds of ruin!", 0.65f, 0.9f);
    }

    void EndDecimator()
    {
        if (_aura == null) return;
        var gm = GameManager.I;
        var h = gm.Player;
        var sk = gm.Skills;
        var w = h != null ? h.GetComponent<Weapon>() : null;
        if (h != null)
        {
            h.transform.localScale = _savedScale;
            h.maxHull = _savedMaxHull; h.maxShield = _savedMaxShield;
            h.hull = Mathf.Min(h.hull, h.maxHull);
            h.shield = Mathf.Min(h.shield, h.maxShield);
        }
        if (sk != null)
        {
            sk.stats["might"] = _savedMight;
            sk.stats["cooldown"] = _savedCd;
            sk.stats["speed"] = _savedSpeed;
        }
        if (w != null) w.sigilLevel = _savedSigil;
        Destroy(_aura);
        _aura = null;
        _decimatorLeft = -1f;
        gm.Hud.WaveBanner("DECIMATOR FADED");
    }

    // unlimited lives: the ship comes back after a short count
    public void OnPlayerDied(Health h)
    {
        EndDecimator();
        DecimationMode.Deaths++;
        StartCoroutine(RespawnCo(h));
    }

    IEnumerator RespawnCo(Health h)
    {
        var gm = GameManager.I;
        gm.Hud.WaveBanner("RESPAWNING...  DEATHS " + DecimationMode.Deaths);
        yield return new WaitForSeconds(2.2f);
        if (!gm.Running || !DecimationMode.Active) yield break;
        Vector3 d = Random.onUnitSphere; d.y *= 0.4f;
        h.transform.position += d.normalized * 40f;
        h.Revive(1f);
        h.gameObject.SetActive(true);
        ExplosionFactory.Sparks(h.transform.position, new Color(0.4f, 0.9f, 1f));
        gm.PlaySfx(SfxSynth.WaveUp, 0.8f);
        gm.Hud.WaveBanner("BACK IN THE FIGHT");
    }
}
