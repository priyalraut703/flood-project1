from flask import Flask, render_template, request, jsonify
import pandas as pd
import numpy as np
import json
import os

app = Flask(__name__)

DATA_PATH = os.path.join(os.path.dirname(__file__), 'data', 'sample_data.csv')

def compute_flood_risk(df):
    df = df.copy()
    df['Flood_Risk_Score'] = (
        df['Rainfall_mm'] * 0.6 +
        (100 - df['Elevation_m']) * 0.2 +
        (100 - df['Drainage_Capacity']) * 0.2
    )
    def classify(score):
        if score >= 90:
            return 'HIGH'
        elif score >= 60:
            return 'MEDIUM'
        else:
            return 'LOW'
    df['Risk_Level'] = df['Flood_Risk_Score'].apply(classify)
    return df

def compute_readiness(df):
    df = df.copy()
    df['Readiness_Score'] = (
        df['Drainage_Capacity'] * 0.5 +
        df['Elevation_m'].clip(upper=100) * 0.3 +
        df['Emergency_Resources'] * 0.2
    ).clip(0, 100)
    return df

def compute_drain_failure(df):
    df = df.copy()
    df['Drain_Failure_Risk'] = df['Rainfall_mm'] / df['Drainage_Capacity'].replace(0, 1)
    df['Drain_Failed'] = df['Drain_Failure_Risk'] > 4
    return df

def allocate_resources(risk_level):
    if risk_level == 'HIGH':
        return {'pumps': 3, 'teams': 2, 'action': 'Deploy rescue teams + 3 pumps'}
    elif risk_level == 'MEDIUM':
        return {'pumps': 2, 'teams': 1, 'action': '2 pumps deployed'}
    else:
        return {'pumps': 0, 'teams': 0, 'action': 'Monitoring only'}

def generate_action_timeline(df):
    high_wards = df[df['Risk_Level'] == 'HIGH']['Ward'].tolist()
    med_wards  = df[df['Risk_Level'] == 'MEDIUM']['Ward'].tolist()
    timeline = [
        {'time': 'T-3 hours', 'action': 'Clean and inspect all drains', 'wards': high_wards + med_wards, 'priority': 'HIGH'},
        {'time': 'T-2 hours', 'action': 'Pre-position pumping equipment', 'wards': high_wards, 'priority': 'HIGH'},
        {'time': 'T-1 hour',  'action': 'Send citizen alerts & warnings', 'wards': high_wards + med_wards, 'priority': 'MEDIUM'},
        {'time': 'T-30 min',  'action': 'Open emergency shelters', 'wards': high_wards, 'priority': 'HIGH'},
        {'time': 'T-0',       'action': 'Deploy rescue teams to high-risk wards', 'wards': high_wards, 'priority': 'CRITICAL'},
    ]
    return timeline

def process_dataframe(df, rainfall_override=None):
    if rainfall_override is not None:
        df['Rainfall_mm'] = rainfall_override
    df = compute_flood_risk(df)
    df = compute_readiness(df)
    df = compute_drain_failure(df)
    resources = []
    for _, row in df.iterrows():
        res = allocate_resources(row['Risk_Level'])
        resources.append(res)
    df['Pumps']  = [r['pumps']  for r in resources]
    df['Teams']  = [r['teams']  for r in resources]
    df['Action'] = [r['action'] for r in resources]
    return df

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/analyze', methods=['POST'])
def analyze():
    try:
        rainfall_override = None
        df = None

        if 'file' in request.files and request.files['file'].filename:
            f = request.files['file']
            df = pd.read_csv(f)
        else:
            df = pd.read_csv(DATA_PATH)

        slider_val = request.form.get('rainfall_mm')
        if slider_val:
            rainfall_override = float(slider_val)

        df = process_dataframe(df, rainfall_override)

        ward_data = []
        for _, row in df.iterrows():
            ward_data.append({
                'ward': row['Ward'],
                'rainfall': float(row['Rainfall_mm']),
                'elevation': float(row['Elevation_m']),
                'drainage_capacity': float(row['Drainage_Capacity']),
                'population': int(row.get('Population', 50000)),
                'emergency_resources': float(row.get('Emergency_Resources', 60)),
                'flood_risk_score': round(float(row['Flood_Risk_Score']), 2),
                'risk_level': row['Risk_Level'],
                'readiness_score': round(float(row['Readiness_Score']), 2),
                'drain_failure_risk': round(float(row['Drain_Failure_Risk']), 2),
                'drain_failed': bool(row['Drain_Failed']),
                'pumps': int(row['Pumps']),
                'teams': int(row['Teams']),
                'action': row['Action'],
                'lat': float(row.get('Lat', 19.076 + np.random.uniform(-0.05, 0.05))),
                'lng': float(row.get('Lng', 72.877 + np.random.uniform(-0.05, 0.05))),
            })

        high_wards = [w for w in ward_data if w['risk_level'] == 'HIGH']
        med_wards  = [w for w in ward_data if w['risk_level'] == 'MEDIUM']
        low_wards  = [w for w in ward_data if w['risk_level'] == 'LOW']

        total_pop_affected = sum(w['population'] for w in high_wards + med_wards)
        avg_flood_area = len(high_wards) * 2.5 + len(med_wards) * 1.2
        total_pumps = sum(w['pumps'] for w in ward_data)
        total_teams = sum(w['teams'] for w in ward_data)

        summary = {
            'high_count': len(high_wards),
            'medium_count': len(med_wards),
            'low_count': len(low_wards),
            'total_wards': len(ward_data),
            'population_affected': total_pop_affected,
            'flood_area_km2': round(avg_flood_area, 2),
            'total_pumps': total_pumps,
            'total_teams': total_teams,
            'drain_failures': int(df['Drain_Failed'].sum()),
        }

        timeline = generate_action_timeline(df)

        return jsonify({
            'success': True,
            'wards': ward_data,
            'summary': summary,
            'timeline': timeline,
        })

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/simulate_twin', methods=['POST'])
def simulate_twin():
    data = request.json
    rainfall = data.get('rainfall', 150)
    steps = [
        {'time': 0,  'label': 'T+0 min',  'event': 'Rain begins', 'flood_pct': 0,   'description': 'Rainfall initiates. Drains at normal capacity.'},
        {'time': 30, 'label': 'T+30 min', 'event': 'Accumulation', 'flood_pct': 20, 'description': 'Water begins accumulating in low-elevation areas.'},
        {'time': 60, 'label': 'T+60 min', 'event': 'Drain overflow', 'flood_pct': 55,'description': 'Drains reaching capacity. Overflow begins in high-risk wards.'},
        {'time': 90, 'label': 'T+90 min', 'event': 'Flood expands', 'flood_pct': 85, 'description': 'Flood expands to adjacent streets. Emergency response active.'},
    ]
    scale = min(rainfall / 150.0, 2.0)
    for s in steps:
        s['flood_pct'] = min(100, int(s['flood_pct'] * scale))
    return jsonify({'success': True, 'steps': steps, 'rainfall': rainfall})

if __name__ == '__main__':
    app.run(debug=True, port=5000)
