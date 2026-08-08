using System;
using System.Collections;
using UnityEngine;
using UnityEngine.Networking;

// Live tournament leaderboard client. During a blitz run the current
// score is posted every few seconds and the shared standings are pulled
// back for the live sidebar. Offline-safe: failures just leave the
// local standings in charge.
public class TournamentNet : MonoBehaviour
{
    const string Api = "https://www.markofthezeal.com/api/survive2/scores";
    const float SyncEvery = 5f;

    [Serializable]
    public class Entry { public string name; public string pilot; public int score; public int time; public string verify; }
    [Serializable] class Standings { public string match; public Entry[] entries; }
    [Serializable] class PostBody { public string match, name, pilot, verify; public int score, time; }

    public static TournamentNet I { get; private set; }
    public Entry[] latest = new Entry[0];
    public bool online;

    float _timer = 2f;
    bool _busy;

    public static void Begin(GameObject host)
    {
        if (I == null) I = host.AddComponent<TournamentNet>();
        I.latest = new Entry[0];
        I.online = false;
        I._timer = 2f;
    }

    void Update()
    {
        if (!TournamentMode.Active || GameManager.I == null || !GameManager.I.Running) return;
        _timer -= Time.deltaTime;
        if (_timer <= 0f && !_busy)
        {
            _timer = SyncEvery;
            StartCoroutine(Sync(GameManager.I.score, Mathf.RoundToInt(GameManager.I.ElapsedSeconds), null));
        }
    }

    // post current (or final) score, then refresh standings
    public IEnumerator Sync(int score, int time, Action done)
    {
        _busy = true;
        var body = new PostBody
        {
            match = TournamentMode.MatchCode,
            name = TournamentMode.PlayerName,   // blitz duo: the team name
            pilot = CoopSync.Active && CoopSync.I != null
                ? CoopSync.I.DuoPilots
                : ZealData.Pilots[TournamentMode.PilotIndex].name,
            verify = TournamentMode.VerifyCode(score, time),
            score = score,
            time = time,
        };
        byte[] payload = System.Text.Encoding.UTF8.GetBytes(JsonUtility.ToJson(body));
        using (var post = new UnityWebRequest(Api, "POST"))
        {
            post.uploadHandler = new UploadHandlerRaw(payload);
            post.downloadHandler = new DownloadHandlerBuffer();
            post.SetRequestHeader("Content-Type", "application/json");
            post.timeout = 6;
            yield return post.SendWebRequest();
            online = post.result == UnityWebRequest.Result.Success;
        }
        using (var get = UnityWebRequest.Get(Api + "?match=" + UnityWebRequest.EscapeURL(TournamentMode.MatchCode)))
        {
            get.timeout = 6;
            yield return get.SendWebRequest();
            if (get.result == UnityWebRequest.Result.Success)
            {
                try
                {
                    var parsed = JsonUtility.FromJson<Standings>(get.downloadHandler.text);
                    if (parsed != null && parsed.entries != null) latest = parsed.entries;
                    online = true;
                }
                catch { }
            }
        }
        _busy = false;
        done?.Invoke();
    }
}
