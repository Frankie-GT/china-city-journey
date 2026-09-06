#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
build_neighbors.py
计算中国各级行政区划的接壤邻接关系，并按照层级生成规范化注记：
1. 地级市接壤：同省显示“地级名”（如“十堰市”），外省显示“省份·地级名”（如“河南省·南阳市”）
2. 县级接壤：同市显示“区县名”（如“襄州区”），同省外市显示“地级·区县”（如“随州市·随县”），外省显示“省份·地级·区县”（如“河南省·南阳市·唐河县”）
输出文件：
web/data/neighbors_cities.json
web/data/neighbors_districts.json
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
OUT_DIR = os.path.join(BASE_DIR, "web", "data")

def load_meta():
    provinces = {}
    cities = {}
    districts = {}

    with open(LEVEL3_CSV, 'r', encoding='utf-8') as f:
        reader = csv.reader(f)
        next(reader)
        for row in reader:
            item_id = row[0]
            pid = row[1]
            deep = int(row[2])
            name = row[3]
            ext_id = row[6]
            ext_name = row[7]
            info = {
                'id': item_id,
                'pid': pid,
                'deep': deep,
                'name': name,
                'ext_name': ext_name,
                'ext_id': ext_id
            }
            if deep == 0:
                provinces[item_id] = info
            elif deep == 1:
                cities[item_id] = info
            elif deep == 2:
                districts[item_id] = info

    # 填充父级省市信息
    for cid, c in cities.items():
        prov = provinces.get(c['pid'], {})
        c['province_id'] = c['pid']
        c['province_name'] = prov.get('name', '')
        c['province_ext_name'] = prov.get('ext_name', '')

    for did, d in districts.items():
        city = cities.get(d['pid'], {})
        prov_id = city.get('province_id', did[:2])
        prov = provinces.get(prov_id, {})
        d['city_id'] = d['pid']
        d['city_name'] = city.get('name', '')
        d['city_ext_name'] = city.get('ext_name', '')
        d['province_id'] = prov_id
        d['province_name'] = prov.get('name', '')
        d['province_ext_name'] = prov.get('ext_name', '')

    return provinces, cities, districts

def parse_geo_polygons():
    csv.field_size_limit(sys.maxsize)
    city_polys = {}
    district_polys = {}

    with open(GEO_CSV, 'r', encoding='utf-8') as f:
        reader = csv.reader(f)
        next(reader)
        for row in reader:
            item_id = row[0]
            deep = int(row[2])
            poly_str = row[6]
            geo_str = row[5]

            if item_id == '91' or not poly_str or 'EMPTY' in poly_str or 'EMPTY' in geo_str:
                continue

            center = [float(x) for x in geo_str.split(' ')]

            # 抽样提取坐标点用于快速距离判定
            pts = []
            min_x = 999.0
            max_x = -999.0
            min_y = 999.0
            max_y = -999.0

            for part in poly_str.split(';'):
                sub_pairs = part.split(',')
                # 步长抽样
                step = max(1, len(sub_pairs) // 80)
                for idx in range(0, len(sub_pairs), step):
                    pair = sub_pairs[idx].strip()
                    if not pair:
                        continue
                    sp = pair.split(' ')
                    if len(sp) < 2:
                        continue
                    x = float(sp[0])
                    y = float(sp[1])
                    pts.append((x, y))
                    if x < min_x: min_x = x
                    if x > max_x: max_x = x
                    if y < min_y: min_y = y
                    if y > max_y: max_y = y

            if not pts:
                continue

            obj = {
                'id': item_id,
                'center': center,
                'pts': pts,
                'bbox': (min_x, min_y, max_x, max_y)
            }

            if deep == 1:
                city_polys[item_id] = obj
            elif deep == 2:
                district_polys[item_id] = obj

    return city_polys, district_polys

def check_touching(obj1, obj2, threshold=0.015):
    b1 = obj1['bbox']
    b2 = obj2['bbox']
    # Bbox overlap check
    if not (b1[0] <= b2[2] + threshold and b1[2] >= b2[0] - threshold and
            b1[1] <= b2[3] + threshold and b1[3] >= b2[1] - threshold):
        return False, 999.0

    # Min distance between sample points
    min_d = 999.0
    for p1 in obj1['pts']:
        for p2 in obj2['pts']:
            d = math.hypot(p1[0] - p2[0], p1[1] - p2[1])
            if d < min_d:
                min_d = d
                if min_d < threshold:
                    return True, min_d
    return min_d < threshold, min_d

def main():
    t0 = time.time()
    print("=== 开始构建接壤邻区拓扑网络与层级注记 ===")

    provinces, cities, districts = load_meta()
    print(f"元数据加载完成: {len(provinces)} 省, {len(cities)} 市, {len(districts)} 区县")

    city_polys, district_polys = parse_geo_polygons()
    print(f"坐标加载完成: {len(city_polys)} 个地级市多边形, {len(district_polys)} 个区县多边形")

    # 1. 计算地级市邻接表
    print("正在计算地级市接壤关系...")
    city_neighbors = {}
    city_ids = list(city_polys.keys())

    for i in range(len(city_ids)):
        cid1 = city_ids[i]
        cinfo1 = cities.get(cid1, {})
        obj1 = city_polys[cid1]
        for j in range(i + 1, len(city_ids)):
            cid2 = city_ids[j]
            cinfo2 = cities.get(cid2, {})
            obj2 = city_polys[cid2]

            touch, dist = check_touching(obj1, obj2, threshold=0.02)
            if touch:
                # 记录双方为邻居
                # 针对 cid1 的 label
                if cinfo2.get('province_id') == cinfo1.get('province_id'):
                    label1 = cinfo2.get('ext_name', cinfo2.get('name', ''))
                    is_outside = False
                else:
                    prov_name = cinfo2.get('province_ext_name', cinfo2.get('province_name', ''))
                    label1 = f"{prov_name}·{cinfo2.get('ext_name', cinfo2.get('name', ''))}"
                    is_outside = True

                city_neighbors.setdefault(cid1, []).append({
                    'id': cid2,
                    'name': cinfo2.get('name', ''),
                    'ext_name': cinfo2.get('ext_name', ''),
                    'center': obj2['center'],
                    'province_id': cinfo2.get('province_id'),
                    'province_name': cinfo2.get('province_name'),
                    'label': label1,
                    'is_outside_province': is_outside
                })

                # 针对 cid2 的 label
                if cinfo1.get('province_id') == cinfo2.get('province_id'):
                    label2 = cinfo1.get('ext_name', cinfo1.get('name', ''))
                    is_outside2 = False
                else:
                    prov_name = cinfo1.get('province_ext_name', cinfo1.get('province_name', ''))
                    label2 = f"{prov_name}·{cinfo1.get('ext_name', cinfo1.get('name', ''))}"
                    is_outside2 = True

                city_neighbors.setdefault(cid2, []).append({
                    'id': cid1,
                    'name': cinfo1.get('name', ''),
                    'ext_name': cinfo1.get('ext_name', ''),
                    'center': obj1['center'],
                    'province_id': cinfo1.get('province_id'),
                    'province_name': cinfo1.get('province_name'),
                    'label': label2,
                    'is_outside_province': is_outside2
                })

    out_city_path = os.path.join(OUT_DIR, "neighbors_cities.json")
    with open(out_city_path, 'w', encoding='utf-8') as f:
        json.dump(city_neighbors, f, ensure_ascii=False)
    print(f"地级市接壤关系生成完毕: {out_city_path}")

    # 2. 计算区县级邻接表（采用空间网格索引加速）
    print("正在为区县建立空间网格并计算接壤关系...")
    grid = {}
    cell_size = 1.0  # 1度网格
    for did, obj in district_polys.items():
        min_x, min_y, max_x, max_y = obj['bbox']
        for gx in range(int(min_x // cell_size), int(max_x // cell_size) + 1):
            for gy in range(int(min_y // cell_size), int(max_y // cell_size) + 1):
                grid.setdefault((gx, gy), []).append(did)

    checked_pairs = set()
    district_neighbors = {}

    for (gx, gy), d_list in grid.items():
        n = len(d_list)
        for i in range(n):
            did1 = d_list[i]
            obj1 = district_polys[did1]
            dinfo1 = districts.get(did1, {})
            for j in range(i + 1, n):
                did2 = d_list[j]
                pair_key = (min(did1, did2), max(did1, did2))
                if pair_key in checked_pairs:
                    continue
                checked_pairs.add(pair_key)

                obj2 = district_polys[did2]
                dinfo2 = districts.get(did2, {})

                touch, dist = check_touching(obj1, obj2, threshold=0.015)
                if touch:
                    # 规则：
                    # 1. 同市：区县名（如“襄州区”）
                    # 2. 同省外市：地级·区县（如“随州市·随县”）
                    # 3. 外省：省份·地级·区县（如“河南省·南阳市·唐河县”）
                    
                    # 针对 did1 的 label
                    c_id1 = dinfo1.get('city_id')
                    p_id1 = dinfo1.get('province_id')
                    c_id2 = dinfo2.get('city_id')
                    p_id2 = dinfo2.get('province_id')

                    if c_id2 == c_id1:
                        lbl1 = dinfo2.get('ext_name', dinfo2.get('name', ''))
                        rel1 = 'same_city'
                    elif p_id2 == p_id1:
                        c_name = dinfo2.get('city_ext_name', dinfo2.get('city_name', ''))
                        lbl1 = f"{c_name}·{dinfo2.get('ext_name', dinfo2.get('name', ''))}"
                        rel1 = 'same_province_other_city'
                    else:
                        p_name = dinfo2.get('province_ext_name', dinfo2.get('province_name', ''))
                        c_name = dinfo2.get('city_ext_name', dinfo2.get('city_name', ''))
                        lbl1 = f"{p_name}·{c_name}·{dinfo2.get('ext_name', dinfo2.get('name', ''))}"
                        rel1 = 'other_province'

                    district_neighbors.setdefault(did1, []).append({
                        'id': did2,
                        'name': dinfo2.get('name', ''),
                        'ext_name': dinfo2.get('ext_name', ''),
                        'center': obj2['center'],
                        'city_id': c_id2,
                        'province_id': p_id2,
                        'label': lbl1,
                        'relation': rel1
                    })

                    # 针对 did2 的 label
                    if c_id1 == c_id2:
                        lbl2 = dinfo1.get('ext_name', dinfo1.get('name', ''))
                        rel2 = 'same_city'
                    elif p_id1 == p_id2:
                        c_name = dinfo1.get('city_ext_name', dinfo1.get('city_name', ''))
                        lbl2 = f"{c_name}·{dinfo1.get('ext_name', dinfo1.get('name', ''))}"
                        rel2 = 'same_province_other_city'
                    else:
                        p_name = dinfo1.get('province_ext_name', dinfo1.get('province_name', ''))
                        c_name = dinfo1.get('city_ext_name', dinfo1.get('city_name', ''))
                        lbl2 = f"{p_name}·{c_name}·{dinfo1.get('ext_name', dinfo1.get('name', ''))}"
                        rel2 = 'other_province'

                    district_neighbors.setdefault(did2, []).append({
                        'id': did1,
                        'name': dinfo1.get('name', ''),
                        'ext_name': dinfo1.get('ext_name', ''),
                        'center': obj1['center'],
                        'city_id': c_id1,
                        'province_id': p_id1,
                        'label': lbl2,
                        'relation': rel2
                    })

    out_dist_path = os.path.join(OUT_DIR, "neighbors_districts.json")
    with open(out_dist_path, 'w', encoding='utf-8') as f:
        json.dump(district_neighbors, f, ensure_ascii=False)
    print(f"区县接壤关系生成完毕: {out_dist_path}")

    print(f"=== 全部接壤拓扑计算完成，总耗时 {time.time() - t0:.2f} 秒 ===")

if __name__ == "__main__":
    main()
