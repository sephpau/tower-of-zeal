using System;
using System.Collections;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using UnityEngine;
using UnityEngine.Networking;

// Multi-peer WebRTC transport (star topology). The host owns one
// connection per joiner and can broadcast; joiners talk to "host" only.
// Signaling flows through the markofthezeal.com mailbox until channels
// open. Editor externs are stubs — networking is WebGL-only.
public class CoopNet : MonoBehaviour
{
    const string Api = "https://www.markofthezeal.com/api/survive2/rtc";
    const char Sep = '\u0001';

#if UNITY_WEBGL && !UNITY_EDITOR
    [DllImport("__Internal")] static extern void NVNetInit(int isHost, int wantMic);
    [DllImport("__Internal")] static extern void NVNetConnect();
    [DllImport("__Internal")] static extern void NVNetSignal(string from, string json);
    [DllImport("__Internal")] static extern IntPtr NVNetPollSignal();
    [DllImport("__Internal")] static extern void NVNetSend(string to, string msg);
    [DllImport("__Internal")] static extern IntPtr NVNetPoll();
    [DllImport("__Internal")] static extern IntPtr NVNetPeers();
    [DllImport("__Internal")] static extern int NVNetState();
    [DllImport("__Internal")] static extern void NVNetMicOn(int on);
    [DllImport("__Internal")] static extern void NVNetVoiceVolume(float v);
    [DllImport("__Internal")] static extern void NVNetClose();
    [DllImport("__Internal")] static extern void NVNetFree(IntPtr p);
    [DllImport("__Internal")] static extern void NVMicStart();
    [DllImport("__Internal")] static extern int NVMicLevel();
    [DllImport("__Internal")] static extern void NVMicStop();
#else
    static void NVNetInit(int isHost, int wantMic) { }
    static void NVNetConnect() { }
    static void NVNetSignal(string from, string json) { }
    static IntPtr NVNetPollSignal() => IntPtr.Zero;
    static void NVNetSend(string to, string msg) { }
    static IntPtr NVNetPoll() => IntPtr.Zero;
    static IntPtr NVNetPeers() => IntPtr.Zero;
    static int NVNetState() => 0;
    static void NVNetMicOn(int on) { }
    static void NVNetVoiceVolume(float v) { }
    static void NVNetClose() { }
    static void NVNetFree(IntPtr p) { }
    static void NVMicStart() { }
    static int NVMicLevel() => -1;
    static void NVMicStop() { }
#endif

    // voice controls (safe to call any time)
    public static void SetMic(bool on) => NVNetMicOn(on ? 1 : 0);
    public static void SetVoiceVolume(float v) => NVNetVoiceVolume(Mathf.Clamp01(v));
    public static void MicTestStart() => NVMicStart();
    public static int MicTestLevel() => NVMicLevel();
    public static void MicTestStop() => NVMicStop();

    static string TakeString(IntPtr p)
    {
        if (p == IntPtr.Zero) return null;
        string s = Marshal.PtrToStringUTF8(p);
        NVNetFree(p);
        return s;
    }

    [Serializable] class SigPost { public string room, from, to, msg; }
    [Serializable] class SigEnvelope { public string from, msg; }
    [Serializable] class SigResp { public SigEnvelope[] msgs; public int next; }

    public bool IsHost { get; private set; }
    public string MyId { get; private set; }
    public bool Open => IsHost ? _peers.Count > 0 : _lastState == 1;
    public int PeerCount => _peers.Count;
    public IEnumerable<string> Peers => _peers;

    public Action<string, string> onMsgFrom;   // (peerId, payload)
    public Action<int> onState;                // joiner link: 1 open, 2 lost, -1 signaling timeout
    public Action<string> onPeerJoined;        // host only
    public Action<string> onPeerLeft;          // host only

    readonly HashSet<string> _peers = new HashSet<string>();
    readonly HashSet<string> _peersScratch = new HashSet<string>();
    string _room;
    int _cursor;
    int _lastState;
    bool _sigRunning;

    public void Connect(bool host, string room, Action<string, string> onMsg, Action<int> onStateCb)
    {
        IsHost = host;
        _room = room;
        MyId = host ? "host" : "p" + UnityEngine.Random.Range(100000, 999999).ToString();
        onMsgFrom = onMsg;
        onState = onStateCb;
        NVNetInit(host ? 1 : 0, 1);
        if (!host) NVNetConnect();
        ResumeSignaling();
    }

    // the host keeps its mailbox open for late joiners while a lobby is up
    public void ResumeSignaling()
    {
        if (_sigRunning) return;
        _sigRunning = true;
        StartCoroutine(SignalLoop());
    }

    public void StopSignaling() => _sigRunning = false;

    public void Send(string to, string msg) => NVNetSend(to, msg);
    public void Broadcast(string msg) => NVNetSend("*", msg);
    // two-peer compatibility: joiners talk to the host, the host to everyone
    public void SendPeer(string msg)
    {
        if (IsHost) Broadcast(msg);
        else Send("host", msg);
    }

    void Update()
    {
        int state = NVNetState();
        if (state != _lastState)
        {
            _lastState = state;
            if (!IsHost) onState?.Invoke(state);
        }

        // roster of open channels → join/leave events (host cares, all track)
        string csv = TakeString(NVNetPeers());
        _peersScratch.Clear();
        if (!string.IsNullOrEmpty(csv))
            foreach (var id in csv.Split(','))
                if (id.Length > 0) _peersScratch.Add(id);
        foreach (var id in _peersScratch)
            if (_peers.Add(id)) onPeerJoined?.Invoke(id);
        Scratch.Clear();
        foreach (var id in _peers)
            if (!_peersScratch.Contains(id)) Scratch.Add(id);
        foreach (var id in Scratch)
        {
            _peers.Remove(id);
            onPeerLeft?.Invoke(id);
        }

        // drain received game messages
        for (int i = 0; i < 400; i++)
        {
            string m = TakeString(NVNetPoll());
            if (m == null) break;
            int cut = m.IndexOf(Sep);
            if (cut > 0) onMsgFrom?.Invoke(m.Substring(0, cut), m.Substring(cut + 1));
        }
    }

    static readonly List<string> Scratch = new List<string>();

    IEnumerator SignalLoop()
    {
        float elapsed = 0f;
        // joiners give up after 2 minutes; the host serves the room for up to 15
        float budget = IsHost ? 900f : 120f;
        while (_sigRunning && elapsed < budget)
        {
            if (!IsHost && NVNetState() != 0) break;   // joiner is connected — done

            string s;
            while ((s = TakeString(NVNetPollSignal())) != null)
            {
                int cut = s.IndexOf(Sep);
                if (cut <= 0) continue;
                var body = JsonUtility.ToJson(new SigPost { room = _room, from = MyId, to = s.Substring(0, cut), msg = s.Substring(cut + 1) });
                using (var post = new UnityWebRequest(Api, "POST"))
                {
                    post.uploadHandler = new UploadHandlerRaw(System.Text.Encoding.UTF8.GetBytes(body));
                    post.downloadHandler = new DownloadHandlerBuffer();
                    post.SetRequestHeader("Content-Type", "application/json");
                    post.timeout = 6;
                    yield return post.SendWebRequest();
                }
            }

            using (var get = UnityWebRequest.Get(Api + "?room=" + UnityWebRequest.EscapeURL(_room) + "&for=" + MyId + "&after=" + _cursor))
            {
                get.timeout = 6;
                yield return get.SendWebRequest();
                if (get.result == UnityWebRequest.Result.Success)
                {
                    SigResp resp = null;
                    try { resp = JsonUtility.FromJson<SigResp>(get.downloadHandler.text); } catch { }
                    if (resp != null && resp.msgs != null)
                    {
                        foreach (var env in resp.msgs)
                            if (env != null && !string.IsNullOrEmpty(env.msg)) NVNetSignal(env.from, env.msg);
                        _cursor = resp.next;
                    }
                }
            }

            yield return new WaitForSecondsRealtime(1f);
            elapsed += 1f;
        }
        bool timedOut = _sigRunning && !IsHost && NVNetState() == 0;
        _sigRunning = false;
        if (timedOut) onState?.Invoke(-1);
    }

    void OnDestroy() => NVNetClose();
}
