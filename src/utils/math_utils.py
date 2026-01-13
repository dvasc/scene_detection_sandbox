def calculate_narrative_metrics(scene_profiles):
    """
    Calculates statistical KPIs and prepares scene profiles for narrative distribution analysis.
    This logic extracts metrics like average scene length and identifies peaks 
    in scene frequency bins.
    """
    if not scene_profiles:
        return {
            'min': 0, 'max': 0, 'avg': 0, 
            'mode_range': 'N/A', 'mode_val': 0,
            'distribution': {},
            'raw_data': []
        }

    lengths = [p['length'] for p in scene_profiles]
    
    _min = min(lengths)
    _max = max(lengths)
    _avg = sum(lengths) / len(lengths)

    # Calculate Frequency Distribution (Raw Shot Counts)
    distribution = {}
    for length in lengths:
        distribution[length] = distribution.get(length, 0) + 1
    
    sorted_dist = dict(sorted(distribution.items()))

    # Group into Bins for 'Mode Range' analysis (5-shot increments)
    bins = {}
    for length in lengths:
        bin_idx = (length - 1) // 5
        bin_key = f"{(bin_idx * 5) + 1}-{(bin_idx + 1) * 5}"
        bins[bin_key] = bins.get(bin_key, 0) + 1
    
    mode_range = max(bins, key=bins.get) if bins else "0-0"
        
    try:
        # Determine the midpoint of the most common range for numerical analysis
        mr_start, mr_end = map(int, mode_range.split('-'))
        mode_val = (mr_start + mr_end) / 2
    except:
        mode_val = 0

    return {
        'min': _min, 'max': _max, 'avg': round(_avg, 1),
        'mode_range': mode_range, 'mode_val': mode_val,
        'distribution': sorted_dist,
        'raw_data': scene_profiles
    }