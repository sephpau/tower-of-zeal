mergeInto(LibraryManager.library, {
  NVDiscordAvailable: function () {
    return (window.NVDiscordAvailable && window.NVDiscordAvailable()) ? 1 : 0;
  },
  NVDiscordGetUser: function () {
    var s = (window.NVDiscordUser && window.NVDiscordUser()) || "";
    var len = lengthBytesUTF8(s) + 1;
    var buf = _malloc(len);
    stringToUTF8(s, buf, len);
    return buf;
  },
  NVDiscordLogin: function () {
    if (window.NVDiscordLogin) window.NVDiscordLogin();
  },
  NVDiscordLogout: function () {
    if (window.NVDiscordLogout) window.NVDiscordLogout();
  },
  NVWalletGetAddress: function () {
    var s = (window.NVWalletAddress && window.NVWalletAddress()) || "";
    var len = lengthBytesUTF8(s) + 1;
    var buf = _malloc(len);
    stringToUTF8(s, buf, len);
    return buf;
  },
  NVWalletIsBusy: function () {
    return (window.NVWalletBusy && window.NVWalletBusy()) ? 1 : 0;
  },
  NVWalletPullError: function () {
    var s = (window.NVWalletTakeError && window.NVWalletTakeError()) || "";
    var len = lengthBytesUTF8(s) + 1;
    var buf = _malloc(len);
    stringToUTF8(s, buf, len);
    return buf;
  },
  NVWalletDoConnect: function () {
    if (window.NVWalletConnect) window.NVWalletConnect();
  },
  NVWalletDoDisconnect: function () {
    if (window.NVWalletDisconnect) window.NVWalletDisconnect();
  }
});
