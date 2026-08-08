using UnityEngine;

// Campaign: 10 waves. Interceptors from wave 1, gunships join at wave 4,
// wave 10 is the Void Dreadnought with an escort. Clear it all to win.
public class WaveDirector : MonoBehaviour
{
    public const int FinalWave = 10;

    public int wave;
    public int hostilesAlive;
    public Health bossHealth;    // non-null while a boss lives
    public string bossName = "";

    float _intermission;
    bool _spawning;
    bool _finished;
    public bool endless;   // campaign survival mode after the Dreadnought falls

    public void Begin()
    {
        wave = 0;
        hostilesAlive = 0;
        bossHealth = null;
        _finished = false;
        endless = false;
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

        var miniboss = System.Array.Find(ZealData.Bosses, b => b.wave == wave);
        if (wave == FinalWave)
        {
            GameManager.I.OnBossWave("!! VOID DREADNOUGHT !!");
            var boss = EnemyFactory.BuildDreadnought(center + RandomShellDir() * 210f);
            SetBoss(boss.GetComponent<Health>(), "VOID DREADNOUGHT");
            bossHealth.OnDeath += _ => { ClearBoss(); HostileDown(); };
            hostilesAlive = 1;
            for (int i = 0; i < 3; i++) SpawnOne(center, true, false);
        }
        else if (miniboss != null)
        {
            GameManager.I.OnBossWave("!! " + miniboss.name.ToUpperInvariant() + " !!", miniboss.taunt);
            var boss = EnemyFactory.BuildMiniboss(center + RandomShellDir() * 165f, miniboss);
            SetBoss(boss.GetComponent<Health>(), miniboss.name.ToUpperInvariant());
            hostilesAlive = 1;   // MinibossAI reports death via GameManager.BossDown
            for (int i = 0; i < 2; i++) SpawnOne(center, true, false);
        }
        else
        {
            GameManager.I.OnWaveStarted(wave);
            int over = Mathf.Max(0, wave - FinalWave);   // survival waves grow ever larger
            int interceptors = Mathf.Min(Mathf.Min(3 + wave, 9) + over, 18);
            int gunships = wave >= 4 ? Mathf.Min(Mathf.Min((wave - 2) / 2, 3) + over / 2, 8) : 0;
            for (int i = 0; i < interceptors; i++) SpawnOne(center, true, false);
            for (int i = 0; i < gunships; i++) SpawnOne(center, false, true);
        }
        _spawning = false;
        _intermission = 4f;
    }

    void SpawnOne(Vector3 center, bool interceptor, bool gunship)
    {
        Vector3 pos = center + RandomShellDir() * Random.Range(110f, 170f);
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

    public void SetBoss(Health h, string name) { bossHealth = h; bossName = name; }
    public void ClearBoss() { bossHealth = null; bossName = ""; }

    public void RegisterSummon(GameObject enemy)
    {
        enemy.GetComponent<Health>().OnDeath += _ => HostileDown();
        hostilesAlive++;
    }

    public void HostileDown()
    {
        hostilesAlive = Mathf.Max(0, hostilesAlive - 1);
        if (hostilesAlive == 0)
        {
            if (wave == FinalWave && !endless)
            {
                if (TournamentMode.Active)
                {
                    _finished = true;
                    GameManager.I.Victory();
                }
                else
                {
                    endless = true;   // campaign: the fight never ends
                    GameManager.I.OnSurvivalStart();
                }
            }
            else
                GameManager.I.OnWaveCleared(wave);
        }
    }
}
