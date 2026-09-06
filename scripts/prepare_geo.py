#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
prepare_geo.py
从 AreaCity-JsSpider-StatsGov 原始地理数据中提取并生成高效的 Web 端分片数据：
1. web/data/china_provinces.json (全国省级总览，含南海诸岛规范插图，秒开)
2. web/data/provinces/{province_id}.json (分省的地级市和区县两级矢量切片)
3. web/data/city_meta.json (全国省市县快速检索与拼音索引)
"""

import os
import sys
import csv
import json
import math
import time

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LEVEL3_CSV = os.path.join(BASE_DIR, "AreaCity-JsSpider-StatsGov", "ok_data_level3-4.csv", "ok_data_level3.csv")
GEO_CSV = os.path.join(BASE_DIR, "AreaCity-JsSpider-StatsGov", "ok_geo.csv", "ok_geo.csv")
ARTICLES_JSON = os.path.join(BASE_DIR, "web", "data", "articles.json")

OUT_DIR = os.path.join(BASE_DIR, "web", "data")
PROVINCES_DIR = os.path.join(OUT_DIR, "provinces")

def point_line_distance(pt, line_start, line_end):
    px, py = pt
    x1, y1 = line_start
    x2, y2 = line_end
    dx = x2 - x1
    dy = y2 - y1
    denom = dx * dx + dy * dy
    if denom == 0:
        return math.hypot(px - x1, py - y1)
    t = ((px - x1) * dx + (py - y1) * dy) / denom
    if t < 0.0: t = 0.0
    elif t > 1.0: t = 1.0
    proj_x = x1 + t * dx
    proj_y = y1 + t * dy
    return math.hypot(px - proj_x, py - proj_y)

def rdp_iterative(points, epsilon):
    """
    非递归实现的 Ramer-Douglas-Peucker 边界抽稀算法，防止深度递归栈溢出
    """
    if len(points) < 3:
        return points
    stack = [(0, len(points) - 1)]
    keep = [False] * len(points)
    keep[0] = True
    keep[-1] = True

    while stack:
        start, end = stack.pop()
        dmax = 0.0
        index = start
        x1, y1 = points[start]
        x2, y2 = points[end]
        dx = x2 - x1
        dy = y2 - y1
        denom = dx * dx + dy * dy

        for i in range(start + 1, end):
            px, py = points[i]
            if denom == 0:
                d = math.hypot(px - x1, py - y1)
            else:
                t = ((px - x1) * dx + (py - y1) * dy) / denom
                if t < 0.0: t = 0.0
                elif t > 1.0: t = 1.0
                d = math.hypot(px - (x1 + t * dx), py - (y1 + t * dy))

            if d > dmax:
                dmax = d
                index = i

        if dmax > epsilon:
            keep[index] = True
            stack.append((start, index))
            stack.append((index, end))

    return [points[i] for i in range(len(points)) if keep[i]]

def parse_polygon_string(poly_str, epsilon, precision=4, min_points=3):
    """
    将 ok_geo.csv 中的多边形字符串转换为 MultiPolygon GeoJSON coordinates
    """
    parts = poly_str.split(';')
    multi_coords = []
    for part in parts:
        pts = []
        for pair in part.strip().split(','):
            if not pair.strip():
                continue
            sp = pair.strip().split(' ')
            if len(sp) < 2:
                continue
            pts.append([round(float(sp[0]), precision), round(float(sp[1]), precision)])
        
        simp = rdp_iterative(pts, epsilon)
        if len(simp) >= min_points:
            if simp[0] != simp[-1]:
                simp.append(simp[0])
            multi_coords.append([simp])

    return multi_coords

def get_nanhai_feature():
    """
    生成经典国家规范版南海诸岛附图九段线/十段线及群岛轮廓
    """
    geo_coord = [126.0, 25.0]
    points = [
        [[0, 3.5], [7, 11.2], [15, 11.9], [30, 7], [42, 0.7], [52, 0.7],
         [56, 7.7], [59, 0.7], [64, 0.7], [64, 0], [5, 0], [0, 3.5]],
        [[13, 16.1], [19, 14.7], [16, 21.7], [11, 23.1], [13, 16.1]],
        [[12, 32.2], [14, 38.5], [15, 38.5], [13, 32.2], [12, 32.2]],
        [[16, 47.6], [12, 53.2], [13, 53.2], [18, 47.6], [16, 47.6]],
        [[6, 64.4], [8, 70], [9, 70], [8, 64.4], [6, 64.4]],
        [[23, 82.6], [29, 79.8], [30, 79.8], [25, 82.6], [23, 82.6]],
        [[37, 70.7], [43, 62.3], [44, 62.3], [39, 70.7], [37, 70.7]],
        [[48, 51.1], [51, 45.5], [53, 45.5], [50, 51.1], [48, 51.1]],
        [[51, 35], [51, 28.7], [53, 28.7], [53, 35], [51, 35]],
        [[52, 22.4], [55, 17.5], [56, 17.5], [53, 22.4], [52, 22.4]],
        [[58, 12.6], [62, 7], [63, 7], [60, 12.6], [58, 12.6]],
        [[0, 3.5], [0, 93.1], [64, 93.1], [64, 0], [63, 0], [63, 92.4],
         [1, 92.4], [1, 3.5], [0, 3.5]]
    ]
    coords = []
    for poly in points:
        ring = []
        for pt in poly:
            lng = round(pt[0] / 10.5 + geo_coord[0], 4)
            lat = round(pt[1] / -10.5 * 0.75 + geo_coord[1], 4)
            ring.append([lng, lat])
        coords.append([ring])
    return {
        'type': 'Feature',
        'properties': {
            'id': 'nanhai_inset',
            'name': '南海诸岛',
            'is_inset': True,
            'center': [129.0, 19.2]
        },
        'geometry': {
            'type': 'MultiPolygon',
            'coordinates': coords
        }
    }

def main():
    start_time = time.time()
    print("=== 开始处理中国行政区划地理数据 ===")

    # 1. 读取已收录文稿信息
    documented_cities = set()
    documented_provinces = set()
    district_to_article = {}
    if os.path.exists(ARTICLES_JSON):
        with open(ARTICLES_JSON, 'r', encoding='utf-8') as f:
            art_data = json.load(f)
            documented_cities = set(art_data.get('documented_city_ids', []))
            documented_provinces = set(art_data.get('documented_province_ids', []))
            district_to_article = art_data.get('district_to_article', {})
            print(f"已加载文稿索引，包含 {len(documented_cities)} 个收录城市。")

    # 2. 读取 ok_data_level3.csv 属性信息
    meta_by_id = {}
    city_to_province = {}
    district_to_province = {}
    with open(LEVEL3_CSV, 'r', encoding='utf-8') as f:
        reader = csv.reader(f)
        header = next(reader)
        for row in reader:
            item_id = row[0]
            pid = row[1]
            deep = int(row[2])
            meta_by_id[item_id] = {
                'id': item_id,
                'pid': pid,
                'deep': deep,
                'name': row[3],
                'pinyin_prefix': row[4],
                'pinyin': row[5],
                'ext_id': row[6],
                'ext_name': row[7]
            }
            if deep == 1:
                city_to_province[item_id] = pid

    for item_id, meta in meta_by_id.items():
        if meta['deep'] == 2:
            city_id = meta['pid']
            prov_id = city_to_province.get(city_id)
            if prov_id:
                district_to_province[item_id] = prov_id

    # 3. 读取 ok_geo.csv 地理边界
    csv.field_size_limit(sys.maxsize)
    print("正在扫描 ok_geo.csv 并进行分级边界提取与智能抽稀...")

    provinces_features = []
    cities_by_prov = {}     # prov_id -> list of Feature
    districts_by_prov = {}  # prov_id -> list of Feature
    city_meta_list = []

    with open(GEO_CSV, 'r', encoding='utf-8') as f:
        reader = csv.reader(f)
        header = next(reader)
        row_count = 0
        for row in reader:
            row_count += 1
            item_id = row[0]
            pid = row[1]
            deep = int(row[2])
            name = row[3]
            poly_str = row[6]
            meta = meta_by_id.get(item_id, {})

            if item_id == '91':  # 排除国外
                continue

            geo_center = [105.0, 35.0]
            if row[5] and 'EMPTY' not in row[5]:
                try:
                    geo_center = [float(x) for x in row[5].split(' ')]
                except Exception:
                    geo_center = [105.0, 35.0]

            has_poly = bool(poly_str and 'EMPTY' not in poly_str)

            # 收集元数据 (用于搜索与速查)
            city_meta_list.append({
                'id': item_id,
                'pid': pid,
                'deep': deep,
                'name': name,
                'ext_name': meta.get('ext_name', name),
                'pinyin': meta.get('pinyin', ''),
                'pinyin_prefix': meta.get('pinyin_prefix', ''),
                'center': geo_center,
                'has_article': (item_id in documented_cities) or (item_id in district_to_article),
                'has_poly': has_poly
            })

            if not has_poly:
                continue
            if deep == 0:
                coords = parse_polygon_string(poly_str, epsilon=0.012, precision=3, min_points=4)
                if coords:
                    feat = {
                        'type': 'Feature',
                        'properties': {
                            'id': item_id,
                            'name': name,
                            'ext_name': meta.get('ext_name', name),
                            'ext_id': meta.get('ext_id', ''),
                            'center': geo_center,
                            'has_articles': (item_id in documented_provinces)
                        },
                        'geometry': {
                            'type': 'MultiPolygon',
                            'coordinates': coords
                        }
                    }
                    provinces_features.append(feat)

            # 地级市 (deep == 1)
            elif deep == 1:
                prov_id = pid
                coords = parse_polygon_string(poly_str, epsilon=0.003, precision=4, min_points=3)
                if coords:
                    feat = {
                        'type': 'Feature',
                        'properties': {
                            'id': item_id,
                            'pid': pid,
                            'name': name,
                            'ext_name': meta.get('ext_name', name),
                            'ext_id': meta.get('ext_id', ''),
                            'center': geo_center,
                            'has_articles': (item_id in documented_cities)
                        },
                        'geometry': {
                            'type': 'MultiPolygon',
                            'coordinates': coords
                        }
                    }
                    cities_by_prov.setdefault(prov_id, []).append(feat)

            # 区县级 (deep == 2)
            elif deep == 2:
                prov_id = district_to_province.get(item_id)
                if not prov_id:
                    # 备用：前两位匹配省份
                    prov_id = item_id[:2]
                coords = parse_polygon_string(poly_str, epsilon=0.0025, precision=4, min_points=3)
                if coords:
                    feat = {
                        'type': 'Feature',
                        'properties': {
                            'id': item_id,
                            'pid': pid,
                            'name': name,
                            'ext_name': meta.get('ext_name', name),
                            'ext_id': meta.get('ext_id', ''),
                            'center': geo_center,
                            'has_article_section': (item_id in district_to_article)
                        },
                        'geometry': {
                            'type': 'MultiPolygon',
                            'coordinates': coords
                        }
                    }
                    districts_by_prov.setdefault(prov_id, []).append(feat)

    # 添加南海诸岛附图轮廓
    provinces_features.append(get_nanhai_feature())

    # 4. 输出全国省级地图 china_provinces.json
    os.makedirs(PROVINCES_DIR, exist_ok=True)
    china_provinces_path = os.path.join(OUT_DIR, "china_provinces.json")
    with open(china_provinces_path, 'w', encoding='utf-8') as f:
        json.dump({'type': 'FeatureCollection', 'features': provinces_features}, f, ensure_ascii=False)
    print(f"全国省级地图生成成功: {china_provinces_path} (大小: {os.path.getsize(china_provinces_path)/1024:.1f} KB)")

    # 5. 输出各省地级市与区县分片 provinces/{prov_id}.json
    saved_prov_count = 0
    for prov_feat in provinces_features:
        p_id = prov_feat['properties']['id']
        if p_id == 'nanhai_inset':
            continue
        p_cities = cities_by_prov.get(p_id, [])
        p_districts = districts_by_prov.get(p_id, [])
        
        prov_pkg = {
            'province': prov_feat['properties'],
            'cities': {'type': 'FeatureCollection', 'features': p_cities},
            'districts': {'type': 'FeatureCollection', 'features': p_districts}
        }
        prov_file = os.path.join(PROVINCES_DIR, f"{p_id}.json")
        with open(prov_file, 'w', encoding='utf-8') as f:
            json.dump(prov_pkg, f, ensure_ascii=False)
        saved_prov_count += 1

    print(f"分省切片生成成功: 共 {saved_prov_count} 个省份数据包输出到 {PROVINCES_DIR}")

    # 6. 输出城市速查索引 city_meta.json
    city_meta_path = os.path.join(OUT_DIR, "city_meta.json")
    with open(city_meta_path, 'w', encoding='utf-8') as f:
        json.dump(city_meta_list, f, ensure_ascii=False)
    print(f"城市速查索引生成成功: {city_meta_path} (收录 {len(city_meta_list)} 个节点)")

    print(f"=== 全部地理数据准备完毕，耗时 {time.time()-start_time:.2f} 秒 ===")

if __name__ == "__main__":
    main()
