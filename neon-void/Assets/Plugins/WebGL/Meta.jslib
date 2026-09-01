mergeInto(LibraryManager.library, {
  NVMetaJsReady: function () {
    return (window.NVMetaReady && window.NVMetaReady()) ? 1 : 0;
  },
  NVMetaJsSummary: function () {
    var s = (window.NVMetaSummary && window.NVMetaSummary()) || "";
    var len = lengthBytesUTF8(s) + 1; var buf = _malloc(len); stringToUTF8(s, buf, len); return buf;
  },
  NVMetaJsBuy: function (idPtr) {
    var s = (window.NVMetaBuy && window.NVMetaBuy(UTF8ToString(idPtr))) || "{}";
    var len = lengthBytesUTF8(s) + 1; var buf = _malloc(len); stringToUTF8(s, buf, len); return buf;
  },
  NVMetaJsClaimQuest: function (idPtr) {
    var s = (window.NVMetaClaimQuest && window.NVMetaClaimQuest(UTF8ToString(idPtr))) || "{}";
    var len = lengthBytesUTF8(s) + 1; var buf = _malloc(len); stringToUTF8(s, buf, len); return buf;
  },
  NVMetaJsClaimRewards: function () {
    var s = (window.NVMetaClaimRewards && window.NVMetaClaimRewards()) || "{}";
    var len = lengthBytesUTF8(s) + 1; var buf = _malloc(len); stringToUTF8(s, buf, len); return buf;
  },
  NVMetaJsBonuses: function () {
    var s = (window.NVMetaBonuses && window.NVMetaBonuses()) || "{}";
    var len = lengthBytesUTF8(s) + 1; var buf = _malloc(len); stringToUTF8(s, buf, len); return buf;
  },
  NVMetaJsAbsorbRun: function (jsonPtr) {
    var s = (window.NVMetaAbsorbRun && window.NVMetaAbsorbRun(UTF8ToString(jsonPtr))) || "{}";
    var len = lengthBytesUTF8(s) + 1; var buf = _malloc(len); stringToUTF8(s, buf, len); return buf;
  },
  NVMetaJsRunStart: function () {
    if (window.NVRunStart) window.NVRunStart();
  },
  NVMetaJsRunSubmit: function (jsonPtr) {
    if (window.NVRunSubmit) window.NVRunSubmit(UTF8ToString(jsonPtr));
  },
  NVMetaJsBoardFetch: function (periodPtr) {
    if (window.NVBoardFetch) window.NVBoardFetch(UTF8ToString(periodPtr));
  },
  NVMetaJsBoardTake: function () {
    var s = (window.NVBoardTake && window.NVBoardTake()) || "";
    var len = lengthBytesUTF8(s) + 1; var buf = _malloc(len); stringToUTF8(s, buf, len); return buf;
  },
  NVMetaJsPassBuy: function () {
    if (window.NVPassBuy) window.NVPassBuy();
  },
  NVMetaJsPassStatus: function () {
    var s = (window.NVPassStatus && window.NVPassStatus()) || "";
    var len = lengthBytesUTF8(s) + 1; var buf = _malloc(len); stringToUTF8(s, buf, len); return buf;
  },
  NVMetaJsSurvivors: function (pilotPtr) {
    var s = (window.NVMetaSurvivors && window.NVMetaSurvivors(UTF8ToString(pilotPtr))) || "";
    var len = lengthBytesUTF8(s) + 1; var buf = _malloc(len); stringToUTF8(s, buf, len); return buf;
  },
  NVMetaJsBuySurvivor: function (pilotPtr, trackPtr) {
    var s = (window.NVMetaBuySurvivor && window.NVMetaBuySurvivor(UTF8ToString(pilotPtr), UTF8ToString(trackPtr))) || "{}";
    var len = lengthBytesUTF8(s) + 1; var buf = _malloc(len); stringToUTF8(s, buf, len); return buf;
  },
  NVMetaJsSurvivorBonuses: function (pilotPtr) {
    var s = (window.NVMetaSurvivorBonuses && window.NVMetaSurvivorBonuses(UTF8ToString(pilotPtr))) || "{}";
    var len = lengthBytesUTF8(s) + 1; var buf = _malloc(len); stringToUTF8(s, buf, len); return buf;
  },
  NVMetaJsShip: function (pilotPtr) {
    var s = (window.NVMetaShip && window.NVMetaShip(UTF8ToString(pilotPtr))) || "";
    var len = lengthBytesUTF8(s) + 1; var buf = _malloc(len); stringToUTF8(s, buf, len); return buf;
  },
  NVMetaJsBuyShip: function (pilotPtr, idPtr) {
    var s = (window.NVMetaBuyShip && window.NVMetaBuyShip(UTF8ToString(pilotPtr), UTF8ToString(idPtr))) || "{}";
    var len = lengthBytesUTF8(s) + 1; var buf = _malloc(len); stringToUTF8(s, buf, len); return buf;
  },
  NVMetaJsShipBonuses: function (pilotPtr) {
    var s = (window.NVMetaShipBonuses && window.NVMetaShipBonuses(UTF8ToString(pilotPtr))) || "{}";
    var len = lengthBytesUTF8(s) + 1; var buf = _malloc(len); stringToUTF8(s, buf, len); return buf;
  },
  NVMetaJsCrewBonuses: function () {
    var s = (window.NVMetaCrewBonuses && window.NVMetaCrewBonuses()) || "{}";
    var len = lengthBytesUTF8(s) + 1; var buf = _malloc(len); stringToUTF8(s, buf, len); return buf;
  }
});
