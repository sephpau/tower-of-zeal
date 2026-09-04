using System;
using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Networking;

// Room directory for THE DECIMATION lobby: hosts heartbeat their room to
// the signaling endpoint every ~15s, everyone else lists the live rooms.
// Rooms drop off the list 45s after the last heartbeat.
public class RoomDirectory : MonoBehaviour
{
    const string Api = "https://www.markofthezeal.com/api/survive2/rtc";
    const float HeartbeatEvery = 15f;

    [Serializable] public class Room { public string room, host, mode; public int players, age; }
    [Serializable] class RoomList { public Room[] rooms; }
    [Serializable] class Announce { public string room, host, mode; public int players; }
    [Serializable] class AnnounceBody { public Announce announce; }
    [Serializable] class LeaveBody { public Announce leave; }

    static RoomDirectory _i;
    static RoomDirectory I
    {
        get
        {
            if (_i == null)
            {
                var go = new GameObject("RoomDirectory");
                DontDestroyOnLoad(go);
                _i = go.AddComponent<RoomDirectory>();
            }
            return _i;
        }
    }

    Coroutine _heartbeat;
    string _hostingRoom;

    // ---------- listing ----------
    public static void Fetch(string mode, Action<List<Room>> done) => I.StartCoroutine(I.FetchCo(mode, done));

    IEnumerator FetchCo(string mode, Action<List<Room>> done)
    {
        using (var req = UnityWebRequest.Get(Api + "?list=" + UnityWebRequest.EscapeURL(mode)))
        {
            req.timeout = 10;
            yield return req.SendWebRequest();
            var rooms = new List<Room>();
            if (req.result == UnityWebRequest.Result.Success)
            {
                try
                {
                    var list = JsonUtility.FromJson<RoomList>(req.downloadHandler.text);
                    if (list != null && list.rooms != null) rooms.AddRange(list.rooms);
                }
                catch { }
            }
            done?.Invoke(rooms);
        }
    }

    // ---------- hosting ----------
    public static void StartHosting(string room, string mode, Func<string> hostName, Func<int> playerCount)
    {
        var d = I;
        d.StopHostingInternal(false);
        d._hostingRoom = room;
        d._heartbeat = d.StartCoroutine(d.HeartbeatCo(room, mode, hostName, playerCount));
    }

    public static void StopHosting() => I.StopHostingInternal(true);

    void StopHostingInternal(bool sendLeave)
    {
        if (_heartbeat != null) { StopCoroutine(_heartbeat); _heartbeat = null; }
        if (sendLeave && !string.IsNullOrEmpty(_hostingRoom))
            StartCoroutine(PostCo(JsonUtility.ToJson(new LeaveBody { leave = new Announce { room = _hostingRoom, mode = "decimation" } })));
        _hostingRoom = null;
    }

    IEnumerator HeartbeatCo(string room, string mode, Func<string> hostName, Func<int> playerCount)
    {
        while (true)
        {
            var body = new AnnounceBody { announce = new Announce {
                room = room, mode = mode, host = hostName != null ? hostName() : "PILOT",
                players = playerCount != null ? Mathf.Max(1, playerCount()) : 1 } };
            yield return PostCo(JsonUtility.ToJson(body));
            yield return new WaitForSecondsRealtime(HeartbeatEvery);
        }
    }

    IEnumerator PostCo(string json)
    {
        using (var req = new UnityWebRequest(Api, "POST"))
        {
            req.uploadHandler = new UploadHandlerRaw(System.Text.Encoding.UTF8.GetBytes(json));
            req.downloadHandler = new DownloadHandlerBuffer();
            req.SetRequestHeader("Content-Type", "application/json");
            req.timeout = 10;
            yield return req.SendWebRequest();
        }
    }

    // short, readable room code for hosts who just want to play
    public static string NewCode()
    {
        const string alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        var sb = new System.Text.StringBuilder("DECIM-");
        for (int i = 0; i < 4; i++) sb.Append(alphabet[UnityEngine.Random.Range(0, alphabet.Length)]);
        return sb.ToString();
    }
}
