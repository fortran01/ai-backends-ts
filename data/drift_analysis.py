
import pandas as pd
import numpy as np
import json
import sys
from scipy import stats
import os

def analyze_drift():
    """Perform basic drift analysis using statistical tests"""
    try:
        # Read reference and production data
        reference_path = '/Users/f/Library/CloudStorage/Dropbox/Projects/Inflection Group/be3/projects/ai-backends-ts/data/reference_data.csv'
        production_path = '/Users/f/Library/CloudStorage/Dropbox/Projects/Inflection Group/be3/projects/ai-backends-ts/data/production_requests.csv'
        
        # Load datasets
        reference_df = pd.read_csv(reference_path)
        production_df = pd.read_csv(production_path)
        
        # Take only recent samples based on limit
        if len(production_df) > 100:
            production_df = production_df.tail(100)
        
        # Feature columns for analysis
        feature_columns = ['sepal_length', 'sepal_width', 'petal_length', 'petal_width']
        
        # Perform Kolmogorov-Smirnov tests for each feature
        drift_results = {}
        overall_drift_score = 0
        significant_drifts = 0
        
        for feature in feature_columns:
            ref_data = reference_df[feature].values
            prod_data = production_df[feature].values
            
            # KS test
            ks_statistic, p_value = stats.ks_2samp(ref_data, prod_data)
            
            # Calculate drift score (0-1 scale)
            drift_score = min(ks_statistic * 2, 1.0)  # Scale to 0-1
            overall_drift_score += drift_score
            
            # Check significance (p < 0.05)
            is_significant = p_value < 0.05
            if is_significant:
                significant_drifts += 1
            
            drift_results[feature] = {
                'ks_statistic': float(ks_statistic),
                'p_value': float(p_value),
                'drift_score': float(drift_score),
                'is_significant': bool(is_significant),
                'drift_detected': bool(ks_statistic > 0.1),
                'reference_mean': float(ref_data.mean()),
                'production_mean': float(prod_data.mean()),
                'reference_std': float(ref_data.std()),
                'production_std': float(prod_data.std())
            }
        
        # Calculate overall drift metrics
        overall_drift_score = overall_drift_score / len(feature_columns)
        drift_severity = 'low' if overall_drift_score < 0.2 else 'medium' if overall_drift_score < 0.5 else 'high'
        
        # Generate recommendations
        recommendations = []
        if significant_drifts > 0:
            recommendations.append(f"🚨 Detected significant drift in {significant_drifts} feature(s)")
            recommendations.append("Consider retraining the model with recent data")
        if overall_drift_score > 0.3:
            recommendations.append("Monitor model performance metrics closely")
        if overall_drift_score < 0.1:
            recommendations.append("✅ Data distribution is stable")
        
        # Prepare analysis results
        analysis_results = {
            'drift_analysis': {
                'overall_drift_score': float(overall_drift_score),
                'drift_severity': drift_severity,
                'significant_drifts': significant_drifts,
                'total_features': len(feature_columns),
                'feature_analysis': drift_results
            },
            'data_summary': {
                'reference_samples': len(reference_df),
                'production_samples': len(production_df),
                'analysis_limit': 100
            },
            'recommendations': recommendations,
            'monitoring_status': {
                'level': 'normal' if overall_drift_score < 0.2 else 'warning' if overall_drift_score < 0.5 else 'critical',
                'requires_attention': bool(significant_drifts > 0 or overall_drift_score > 0.3)
            }
        }
        
        print(json.dumps(analysis_results, indent=2))
        
    except Exception as e:
        error_result = {
            'error': 'Python drift analysis failed',
            'details': str(e),
            'recommendation': 'Check Python environment and required packages (pandas, numpy, scipy)'
        }
        print(json.dumps(error_result, indent=2))

if __name__ == '__main__':
    analyze_drift()
