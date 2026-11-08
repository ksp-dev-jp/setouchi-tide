// =====================================================================
// 配信対象の地点
//
// lib/stations.mjs は「知っている地点」の全部（自動生成データ）。
// このモジュールが返すのは「実際にページを出す地点」。
//
// 両者を分けているのは、SITE.OFFICIAL_ONLY で近似地点を配信から外しても、
// スラッグの採番（routes.mjs）は全地点で行いたいから。採番対象が変わると
// 同名衝突の連番が付け替わり、残る公式観測点の URL まで変わってしまう。
// すでにインデックスされた URL を死なせないための分離。
// =====================================================================

import { SITE } from '../config.mjs';
import { TIDE_STATIONS } from './stations.mjs';

export const SERVED_STATIONS = SITE.OFFICIAL_ONLY
  ? TIDE_STATIONS.filter(s => !s.jmaAnchor)
  : TIDE_STATIONS;
