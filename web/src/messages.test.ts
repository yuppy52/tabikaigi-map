// API の失敗から文と行き先を選ぶ計算のテスト。screens の「API の応答と画面の動き」「知らせ」の表のとおりか、
// 表にない値が「保存できませんでした」になるかを確かめる
import { describe, expect, it } from "vitest";
import { refused, type Failure } from "./data/api";
import {
  BAD_NAME,
  createErrorText,
  GROUP_DELETED,
  joinErrorOf,
  LOAD_FAILED,
  loadErrorOf,
  RATE_LIMITED,
  SAVE_FAILED,
  TURNSTILE_FAILED,
  UNAVAILABLE,
  visitErrorOf,
} from "./messages";

const network: Failure = { kind: "network" };
const temporary: Failure = { kind: "unavailable", reason: "temporary" };
const quota: Failure = { kind: "unavailable", reason: "quota" };
const rateLimited: Failure = { kind: "rate_limited" };

describe("loadErrorOf：グループを開けなかったとき", () => {
  it("404 group_not_found は「このグループは削除されました」で、覚えを忘れる。読み直すボタンは出さない", () => {
    expect(loadErrorOf(refused(404, "group_not_found"))).toEqual({ text: GROUP_DELETED, retry: false, forget: true });
  });

  it("通信エラーと一時的な 503 は「読み込めませんでした」と、もう一度読み込むボタン。覚えは変えない", () => {
    expect(loadErrorOf(network)).toEqual({ text: LOAD_FAILED, retry: true, forget: false });
    expect(loadErrorOf(temporary)).toEqual({ text: LOAD_FAILED, retry: true, forget: false });
  });

  it("枠切れ（503 quota、JSON でない応答）は「いまは混み合っていて…」。ボタンは出さない", () => {
    expect(loadErrorOf(quota)).toEqual({ text: UNAVAILABLE, retry: false, forget: false });
  });

  it("429 は「少し待ってから…」。すぐには送り直さないのでボタンは出さない", () => {
    expect(loadErrorOf(rateLimited)).toEqual({ text: RATE_LIMITED, retry: false, forget: false });
  });

  it("表にない値（400 bad_request、形の違う応答）は「保存できませんでした」", () => {
    expect(loadErrorOf(refused(400, "bad_request"))).toMatchObject({ text: SAVE_FAILED, forget: false });
    expect(loadErrorOf(refused(200, "bad_response"))).toMatchObject({ text: SAVE_FAILED, forget: false });
  });
});

describe("visitErrorOf：「行った」の付け外しが失敗したとき", () => {
  it("403 member_linked は、紐づいた文で参加のシート（覚えを忘れる）", () => {
    expect(visitErrorOf(refused(403, "member_linked"), "ゆう")).toEqual({
      kind: "rejoin",
      text: "ゆうさんはアカウントに紐づきました。ログインして入ってください",
    });
  });

  it("404 member_not_found は、削除された文で参加のシート（REQ-048）", () => {
    expect(visitErrorOf(refused(404, "member_not_found"), "ゆう")).toEqual({
      kind: "rejoin",
      text: "ゆうさんはグループから削除されました",
    });
  });

  it("404 group_not_found は、忘れてエラーの画面", () => {
    expect(visitErrorOf(refused(404, "group_not_found"), "ゆう")).toEqual({ kind: "deleted" });
  });

  it("400・413・404 not_found（画面の不具合）は「保存できませんでした」と、グループを読み直す", () => {
    for (const f of [refused(400, "bad_request"), refused(413, "bad_request"), refused(404, "not_found")]) {
      expect(visitErrorOf(f, "ゆう")).toEqual({ kind: "toast", text: SAVE_FAILED, reload: true });
    }
  });

  it("通信エラー・一時的な 503 は「保存できませんでした」、枠切れは「いまは混み合って…」、429 は「少し待って…」。読み直さない", () => {
    expect(visitErrorOf(network, "ゆう")).toEqual({ kind: "toast", text: SAVE_FAILED, reload: false });
    expect(visitErrorOf(temporary, "ゆう")).toEqual({ kind: "toast", text: SAVE_FAILED, reload: false });
    expect(visitErrorOf(quota, "ゆう")).toEqual({ kind: "toast", text: UNAVAILABLE, reload: false });
    expect(visitErrorOf(rateLimited, "ゆう")).toEqual({ kind: "toast", text: RATE_LIMITED, reload: false });
  });

  it("表にない値（401 login_required など）は「保存できませんでした」", () => {
    expect(visitErrorOf(refused(401, "login_required"), "ゆう")).toEqual({ kind: "toast", text: SAVE_FAILED, reload: false });
  });
});

describe("createErrorText：グループ作成の失敗の文（ボタンの上）", () => {
  it("400 bad_name は名前の決まりの文、403 turnstile_failed は確認の失敗の文", () => {
    expect(createErrorText(refused(400, "bad_name"))).toBe(BAD_NAME);
    expect(createErrorText(refused(403, "turnstile_failed"))).toBe(TURNSTILE_FAILED);
  });

  it("通信エラー・503・429 は書き込みと同じ文", () => {
    expect(createErrorText(network)).toBe(SAVE_FAILED);
    expect(createErrorText(temporary)).toBe(SAVE_FAILED);
    expect(createErrorText(quota)).toBe(UNAVAILABLE);
    expect(createErrorText(rateLimited)).toBe(RATE_LIMITED);
  });

  it("表にない値（ログインなしでは起きない 409 group_limit など）は「保存できませんでした」", () => {
    expect(createErrorText(refused(409, "group_limit"))).toBe(SAVE_FAILED);
    expect(createErrorText(refused(201, "bad_response"))).toBe(SAVE_FAILED);
  });
});

describe("joinErrorOf：参加の失敗のときの動き", () => {
  it("400 bad_name は入力欄の下、403 turnstile_failed はボタンの上", () => {
    expect(joinErrorOf(refused(400, "bad_name"))).toEqual({ kind: "field", text: BAD_NAME });
    expect(joinErrorOf(refused(403, "turnstile_failed"))).toEqual({ kind: "form", text: TURNSTILE_FAILED });
  });

  it("404 group_not_found は削除された、409 group_full は満員のエラーの画面", () => {
    expect(joinErrorOf(refused(404, "group_not_found"))).toEqual({ kind: "deleted" });
    expect(joinErrorOf(refused(409, "group_full"))).toEqual({ kind: "full" });
  });

  it("通信エラー・503・429 は、作成と同じ文をボタンの上に", () => {
    expect(joinErrorOf(network)).toEqual({ kind: "form", text: SAVE_FAILED });
    expect(joinErrorOf(temporary)).toEqual({ kind: "form", text: SAVE_FAILED });
    expect(joinErrorOf(quota)).toEqual({ kind: "form", text: UNAVAILABLE });
    expect(joinErrorOf(rateLimited)).toEqual({ kind: "form", text: RATE_LIMITED });
  });

  it("ログイン済みだけで起きる 409 already_member・group_limit は表にない値（「保存できませんでした」）", () => {
    expect(joinErrorOf(refused(409, "already_member"))).toEqual({ kind: "form", text: SAVE_FAILED });
    expect(joinErrorOf(refused(409, "group_limit"))).toEqual({ kind: "form", text: SAVE_FAILED });
  });
});
