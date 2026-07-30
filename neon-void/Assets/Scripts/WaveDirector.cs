using UnityEngine;

// Campaign: 10 waves. Interceptors from wave 1, gunships join at wave 4,
// wave 10 is the Void Dreadnought with an escort. Clear it all to win.
public class WaveDirector : MonoBehaviour
{
    public const int FinalWave = 10;

    public int wave;
    public int hostilesAlive;
    public Health bossHealth;    // non-null while the dreadnought lives

    float _intermission;
    bool _spawning;
    bool _finished;

    public void Begin()
    {
        wave = 0;
        hostilesAlive = 0;
        bossHealth = null;
        _finished = false;
        _intermission = 3f;
    }

    void Update()
    {
        if (!GameManager.I.Running || _finished) return;
        if (hostilesAlive > 0 || _spawning) return;

        _intermission -= Time.deltaTime;
        if (_intermission <= 0f) StartWave();
    }

    void StartWave()
    {
        wave++;
        _spawning = true;
        var player = FindAnyObjectByType<ShipController>();
        Vector3 center = player != null ? player.transform.position : Vector3.zero;

        if (wave >= FinalWave)
        {
            GameManager.I.OnBossWave();
            var boss = EnemyFactory.BuildDreadnought(center + RandomShellDir() * 260f);
            bossHealth = boss.GetComponent<Health>();
            bossHealth.OnDeath += _ => { bossHealth = null; HostileDown(); };
            hostilesAlive = 1;
            for (int i = 0; i < 3; i++) SpawnOne(center, true, false);
        }
        else
        {
            GameManager.I.OnWaveStarted(wave);
            int interceptors = Mathf.Min(3 + wave, 9);
            int gunships = wave >= 4 ? Mathf.Min((wave - 2) / 2, 3) : 0;
            for (int i = 0; i < interceptors; i++) SpawnOne(center, true, false);
            for (int i = 0; i < gunships; i++) SpawnOne(center, false, true);
        }
        _spawning = false;
        _intermission = 4f;
    }

    void SpawnOne(Vector3 center, bool interceptor, bool gunship)
    {
        Vector3 pos = center + RandomShellDir() * Random.Range(160f, 240f);
        GameObject go = gunship ? EnemyFactory.BuildGunship(pos, wave) : EnemyFactory.BuildInterceptor(pos, wave);
        go.GetComponent<Health>().OnDeath += _ => HostileDown();
        hostilesAlive++;
    }

    static Vector3 RandomShellDir()
    {
        Vector3 dir = Random.onUnitSphere;
        dir.y *= 0.5f;
        return dir.normalized;
    }

    public void HostileDown()
    {
        hostilesAlive = Mathf.Max(0, hostilesAlive - 1);
        if (hostilesAlive == 0)
        {
            if (wave >= FinalWave)
            {
                _finished = true;
                GameManager.I.Victory();
            }
            else
                GameManager.I.OnWaveCleared(wave);
        }
    }
}
