#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
build_articles.py
自动扫描并解析「文稿」目录中的 Markdown 文件，
提取城市综合介绍、各区县专题介绍，并与 AreaCity 行政区划数据建立双向索引关联。
"""

import os
import glob
import re
import csv
import json

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MANUSCRIPTS_DIR = os.path.join(BASE_DIR, "文稿")
CSV_PATH = os.path.join(BASE_DIR, "AreaCity-JsSpider-StatsGov", "ok_data_level3-4.csv", "ok_data_level3.csv")
OUTPUT_ARTICLES = os.path.join(BASE_DIR, "web", "data", "articles.json")

def load_administrative_divisions(csv_path):
    """
    加载行政区划三级数据，建立索引表
    """
    provinces = {}  # id -> {name, ext_id, ext_name}
    cities = {}     # id -> {pid, name, ext_id, ext_name}
    districts = {}  # id -> {pid, name, ext_id, ext_name}
    
    # 查找表
    name_to_city = {}      # '襄阳' or '襄阳市' -> [city_id, ...]
    city_districts = {}    # city_id -> [ {id, name, ext_name}, ... ]

    if not os.path.exists(csv_path):
        print(f"警告：未找到行政区划数据文件 {csv_path}")
        return provinces, cities, districts, name_to_city, city_districts

    with open(csv_path, 'r', encoding='utf-8') as f:
        reader = csv.reader(f)
        header = next(reader)
        for row in reader:
            item_id = row[0]
            pid = row[1]
            deep = int(row[2])
            short_name = row[3]
            ext_id = row[6]
            ext_name = row[7]

            item_info = {
                'id': item_id,
                'pid': pid,
                'name': short_name,
                'ext_id': ext_id,
                'ext_name': ext_name
            }

            if deep == 0:
                provinces[item_id] = item_info
            elif deep == 1:
                cities[item_id] = item_info
                name_to_city.setdefault(short_name, []).append(item_id)
                name_to_city.setdefault(ext_name, []).append(item_id)
                city_districts.setdefault(item_id, [])
            elif deep == 2:
                districts[item_id] = item_info
                city_districts.setdefault(pid, []).append(item_info)

    return provinces, cities, districts, name_to_city, city_districts

def parse_markdown_file(file_path):
    """
    解析单篇城市文稿
    """
    filename = os.path.basename(file_path)
    # 文件名一般形如 "湖北 襄阳.md" 或 "内蒙古 包头.md"
    name_parts = os.path.splitext(filename)[0].split()
    province_hint = name_parts[0] if len(name_parts) > 1 else ""
    city_hint = name_parts[1] if len(name_parts) > 1 else name_parts[0]

    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    lines = content.split('\n')
    
    title = ""
    intro_lines = []
    sections = []
    current_section = None

    for line in lines:
        if line.startswith('# ') and not title:
            title = line[2:].strip()
            continue

        if line.startswith('## '):
            if current_section:
                sections.append(current_section)
            sec_heading = line[3:].strip()
            current_section = {
                'heading': sec_heading,
                'lines': []
            }
        else:
            if current_section is None:
                intro_lines.append(line)
            else:
                current_section['lines'].append(line)

    if current_section:
        sections.append(current_section)

    return {
        'filename': filename,
        'province_hint': province_hint,
        'city_hint': city_hint,
        'title': title or f"{city_hint} 概览",
        'intro': '\n'.join(intro_lines).strip(),
        'sections': [
            {
                'heading': s['heading'],
                'content': '\n'.join(s['lines']).strip()
            }
            for s in sections
        ]
    }

def match_city_and_districts(doc, provinces, cities, districts, name_to_city, city_districts):
    """
    将解析出的文章与真实的行政区划代码及区县进行精准关联
    """
    city_hint = doc['city_hint']
    province_hint = doc['province_hint']
    
    matched_city_id = None
    candidate_city_ids = name_to_city.get(city_hint, [])
    
    if len(candidate_city_ids) == 1:
        matched_city_id = candidate_city_ids[0]
    elif len(candidate_city_ids) > 1:
        # 按省份提示进一步匹配
        for cid in candidate_city_ids:
            city_item = cities[cid]
            prov_item = provinces.get(city_item['pid'], {})
            if province_hint in prov_item.get('name', '') or province_hint in prov_item.get('ext_name', ''):
                matched_city_id = cid
                break
        if not matched_city_id:
            matched_city_id = candidate_city_ids[0]
    else:
        # 模糊匹配
        for cid, city_item in cities.items():
            if city_hint in city_item['name'] or city_item['name'] in city_hint:
                matched_city_id = cid
                break

    if not matched_city_id:
        print(f"无法匹配城市: {doc['filename']}")
        return None

    city_info = cities[matched_city_id]
    prov_info = provinces.get(city_info['pid'], {})
    dists = city_districts.get(matched_city_id, [])

    # 为每个 section 匹配区县
    processed_sections = []
    district_map = {} # dist_id -> section_idx

    for idx, sec in enumerate(doc['sections']):
        heading = sec['heading']
        matched_dists = []
        tags = []

        # 尝试从标题中提取标签，例如 "谷城县：贡米 豆腐乳 骆驼蓄电池"
        if '：' in heading or ':' in heading:
            parts = re.split(r'[:：]', heading, maxsplit=1)
            entity_part = parts[0].strip()
            tag_part = parts[1].strip()
            tags = [t.strip() for t in re.split(r'[,，\s]+', tag_part) if t.strip()]
        else:
            entity_part = heading

        for d in dists:
            d_name = d['name']
            d_ext_name = d['ext_name']
            # 如果标题或实体部分包含了区县名
            if (d_name in entity_part) or (d_ext_name in entity_part):
                matched_dists.append({
                    'id': d['id'],
                    'name': d['name'],
                    'ext_name': d['ext_name']
                })
                district_map[d['id']] = {
                    'section_index': idx,
                    'heading': heading
                }

        processed_sections.append({
            'heading': heading,
            'tags': tags,
            'matched_districts': matched_dists,
            'content': sec['content']
        })

    return {
        'city_id': matched_city_id,
        'city_name': city_info['name'],
        'city_ext_name': city_info['ext_name'],
        'city_ext_id': city_info['ext_id'],
        'province_id': city_info['pid'],
        'province_name': prov_info.get('name', ''),
        'province_ext_name': prov_info.get('ext_name', ''),
        'title': doc['title'],
        'intro': doc['intro'],
        'sections': processed_sections,
        'district_map': district_map
    }

def main():
    print("开始解析文稿...")
    provinces, cities, districts, name_to_city, city_districts = load_administrative_divisions(CSV_PATH)
    
    files = glob.glob(os.path.join(MANUSCRIPTS_DIR, "*.md"))
    print(f"找到 {len(files)} 个文稿文件。")

    articles_data = {
        'cities': {},               # city_id -> article
        'district_to_article': {},  # district_id -> {city_id, section_index, heading}
        'documented_city_ids': [],  # [city_id, ...]
        'documented_province_ids': set() # {province_id, ...}
    }

    for f in sorted(files):
        doc = parse_markdown_file(f)
        matched = match_city_and_districts(doc, provinces, cities, districts, name_to_city, city_districts)
        if matched:
            cid = matched['city_id']
            articles_data['cities'][cid] = matched
            articles_data['documented_city_ids'].append(cid)
            articles_data['documented_province_ids'].add(matched['province_id'])
            
            for dist_id, info in matched['district_map'].items():
                articles_data['district_to_article'][dist_id] = {
                    'city_id': cid,
                    'section_index': info['section_index'],
                    'heading': info['heading']
                }
            print(f"已收录: [{matched['province_name']}] {matched['city_name']} ({cid}) - 共 {len(matched['sections'])} 章节，匹配 {len(matched['district_map'])} 区县")

    articles_data['documented_province_ids'] = list(articles_data['documented_province_ids'])
    
    os.makedirs(os.path.dirname(OUTPUT_ARTICLES), exist_ok=True)
    with open(OUTPUT_ARTICLES, 'w', encoding='utf-8') as out_f:
        json.dump(articles_data, out_f, ensure_ascii=False, indent=2)

    print(f"文稿解析完成，已输出至: {OUTPUT_ARTICLES}")

if __name__ == "__main__":
    main()
