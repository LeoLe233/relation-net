#!/usr/bin/env python3
"""Validate generated Relation Net v1 JSON, without external dependencies.

This checks a canonical subset accepted by Relation Net's v1 importer.
It does not check the truth of extracted story relationships or modify input.
"""
import argparse
from datetime import datetime
import json
import math
from pathlib import Path
import re
import sys


class InvalidGraph(ValueError):
    pass


def require(condition, message):
    if not condition:
        raise InvalidGraph(message)


def object_keys(value, required, location, optional=()):
    require(isinstance(value, dict), f'{location}: expected an object')
    missing = set(required) - value.keys()
    extra = value.keys() - set(required) - set(optional)
    require(not missing, f'{location}: missing fields {sorted(missing)}')
    require(not extra, f'{location}: unsupported fields {sorted(extra)}')


def string(value, limit, location, nonempty=False):
    require(isinstance(value, str), f'{location}: expected a string')
    require(len(value.encode('utf-16-le', 'surrogatepass')) // 2 <= limit,
            f'{location}: longer than {limit} UTF-16 units')
    require(not nonempty or bool(value.strip()), f'{location}: cannot be blank')


def identifier(value, location):
    require(isinstance(value, str) and re.fullmatch(r'[A-Za-z0-9_-]{1,100}', value),
            f'{location}: use 1–100 letters, digits, hyphens or underscores')


def color(value, location):
    require(isinstance(value, str) and re.fullmatch(r'#[0-9a-fA-F]{6}', value),
            f'{location}: expected a six-digit hex color')


def coordinate(value, location):
    require(type(value) in (int, float) and abs(value) <= 100000 and math.isfinite(value),
            f'{location}: expected a finite coordinate within ±100000')


def array(value, maximum, location):
    require(isinstance(value, list), f'{location}: expected an array')
    require(len(value) <= maximum, f'{location}: maximum is {maximum}')


def unique_ids(items, location):
    ids = set()
    for index, item in enumerate(items):
        require(isinstance(item, dict), f'{location}[{index}]: expected an object')
        item_id = item.get('id')
        identifier(item_id, f'{location}[{index}].id')
        require(item_id not in ids, f'{location}: duplicate ID {item_id}')
        ids.add(item_id)
    return ids


def validate_graph(data):
    object_keys(data, ('format', 'version', 'board'), 'root', ('exportedAt',))
    require(data['format'] == 'relation-net', 'format must be relation-net')
    require(type(data['version']) is int and data['version'] == 1, 'version must be numeric 1')
    if 'exportedAt' in data:
        string(data['exportedAt'], 100, 'exportedAt', True)
        try:
            dt = datetime.fromisoformat(data['exportedAt'].replace('Z', '+00:00'))
            require(dt.tzinfo is not None, 'exportedAt must include a time zone')
        except ValueError as exc:
            raise InvalidGraph('exportedAt must be an ISO 8601 timestamp with time zone') from exc
    b = data['board']
    object_keys(b, ('id', 'name', 'kind', 'description', 'characters', 'relations', 'factions'),
                'board', ('relationTypes', 'characterTemplate'))
    identifier(b['id'], 'board.id')
    string(b['name'], 60, 'board.name', True)
    require(b['kind'] in ('书籍', '游戏', '现实', '其他'), 'board.kind is invalid')
    string(b['description'], 10000, 'board.description')
    for key, maximum in (('characters', 500), ('relations', 3000), ('factions', 100)):
        array(b[key], maximum, key)
    ids = unique_ids(b['characters'], 'characters')
    unique_ids(b['relations'], 'relations')
    unique_ids(b['factions'], 'factions')
    kinds = {'cooperation', 'conflict', 'other'}
    types = b.get('relationTypes', [])
    array(types, 100, 'relationTypes')
    unique_ids(types, 'relationTypes')
    names = set()
    for item in types:
        loc = f'relation type {item["id"]}'
        object_keys(item, ('id', 'name', 'color'), loc)
        require(item['id'] not in kinds and item['id'] != '__custom__',
                f'{loc}: reserved type ID')
        string(item['name'], 60, loc + '.name', True)
        key = item['name'].strip().lower()
        require(key not in names, f'{loc}: duplicate type name')
        color(item['color'], loc + '.color')
        names.add(key)
        kinds.add(item['id'])
    fields = b.get('characterTemplate', [])
    array(fields, 30, 'characterTemplate')
    field_ids = unique_ids(fields, 'characterTemplate')
    names = set()
    for field in fields:
        loc = f'character field {field["id"]}'
        object_keys(field, ('id', 'name'), loc)
        string(field['name'], 60, loc + '.name', True)
        key = field['name'].strip().lower()
        require(key not in names, f'{loc}: duplicate field name')
        names.add(key)
    for p in b['characters']:
        loc = f'character {p["id"]}'
        object_keys(p, ('id', 'name', 'alias', 'role', 'notes', 'color', 'x', 'y'), loc,
                    ('attributes',))
        for key, maximum in (('name', 60), ('alias', 60), ('role', 100), ('notes', 10000)):
            string(p[key], maximum, f'{loc}.{key}', key == 'name')
        color(p['color'], loc + '.color')
        for key in ('x', 'y'):
            coordinate(p[key], f'{loc}.{key}')
        if 'attributes' in p:
            require(isinstance(p['attributes'], dict), f'{loc}.attributes: expected an object')
            for key, value in p['attributes'].items():
                require(key in field_ids, f'{loc}.attributes: undefined field {key}')
                string(value, 10000, f'{loc}.attributes.{key}')
    warnings = []
    seen_relations = set()
    for r in b['relations']:
        loc = f'relation {r["id"]}'
        object_keys(r, ('id', 'source', 'target', 'label', 'kind', 'directed', 'notes'), loc)
        for key in ('source', 'target'):
            identifier(r[key], f'{loc}.{key}')
            require(r[key] in ids, f'{loc}.{key}: character does not exist')
        require(r['source'] != r['target'], f'{loc}: self-links are not supported')
        require(isinstance(r['kind'], str) and r['kind'] in kinds, f'{loc}.kind is invalid')
        require(type(r['directed']) is bool, f'{loc}.directed must be a boolean')
        string(r['label'], 60, loc + '.label', True)
        string(r['notes'], 10000, loc + '.notes')
        endpoints = (r['source'], r['target']) if r['directed'] else tuple(sorted((r['source'], r['target'])))
        key = (endpoints, r['directed'], r['label'].strip(), r['kind'])
        if key in seen_relations:
            warnings.append(f'{loc}: repeated relationship; review whether these should be merged')
        seen_relations.add(key)
        if not r['notes'].strip():
            warnings.append(f'{loc}: add a text-grounded evidence note')
    for f in b['factions']:
        loc = f'faction {f["id"]}'
        object_keys(f, ('id', 'name', 'description', 'color', 'members'), loc, ('x', 'y'))
        string(f['name'], 60, loc + '.name', True)
        string(f['description'], 10000, loc + '.description')
        color(f['color'], loc + '.color')
        if 'x' in f or 'y' in f:
            require('x' in f and 'y' in f, f'{loc}: provide both x and y')
            coordinate(f['x'], loc + '.x')
            coordinate(f['y'], loc + '.y')
        array(f['members'], 500, loc + '.members')
        for member in f['members']:
            identifier(member, loc + '.members')
            require(member in ids, f'{loc}: unknown character {member}')
        require(len(f['members']) == len(set(f['members'])), f'{loc}: repeated member')
    overlaps = []
    people = b['characters']
    for index, a in enumerate(people):
        for z in people[index + 1:]:
            if abs(a['x'] - z['x']) < 160 and abs(a['y'] - z['y']) < 144:
                overlaps.append(f'{a["id"]}/{z["id"]}')
    if overlaps:
        warnings.append(f'{len(overlaps)} card pairs overlap or have little margin: {", ".join(overlaps[:8])}')
    return warnings


def strict_object(pairs):
    result = {}
    for key, value in pairs:
        require(key not in result, f'duplicate JSON key: {key}')
        result[key] = value
    return result


def reject_constant(value):
    raise InvalidGraph(f'non-JSON numeric constant: {value}')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('file', type=Path)
    args = parser.parse_args()
    try:
        require(args.file.stat().st_size <= 10 * 1024 * 1024, 'file exceeds 10 MiB')
        data = json.loads(args.file.read_text(encoding='utf-8'), object_pairs_hook=strict_object,
                          parse_constant=reject_constant)
        warnings = validate_graph(data)
        b = data['board']
        print(f'VALID: {len(b["characters"])} characters, {len(b["relations"])} relations, {len(b["factions"])} factions')
        for warning in warnings:
            print('WARNING: ' + warning, file=sys.stderr)
        return 0
    except (OSError, UnicodeError, ValueError, TypeError) as exc:
        print('INVALID: ' + str(exc), file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
