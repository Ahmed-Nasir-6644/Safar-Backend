"""
GTFS Data Enhancement Script
This script generates shapes.txt from stop coordinates and interpolates stop times.
"""

import csv
import math
from datetime import datetime, timedelta

def haversine_distance(lat1, lon1, lat2, lon2):
    """
    Calculate the great circle distance between two points on Earth (in kilometers)
    using the Haversine formula.

    Args:
        lat1, lon1: Latitude and longitude of first point in decimal degrees
        lat2, lon2: Latitude and longitude of second point in decimal degrees

    Returns:
        Distance in kilometers
    """
    # Convert decimal degrees to radians
    lat1, lon1, lat2, lon2 = map(math.radians, [lat1, lon1, lat2, lon2])

    # Haversine formula
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = math.sin(dlat/2)**2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon/2)**2
    c = 2 * math.asin(math.sqrt(a))

    # Radius of Earth in kilometers
    r = 6371

    return c * r

def parse_time(time_str):
    """Parse time string (HH:MM:SS) to datetime object"""
    if not time_str or time_str.strip() == '':
        return None
    h, m, s = map(int, time_str.split(':'))
    return timedelta(hours=h, minutes=m, seconds=s)

def format_time(td):
    """Format timedelta to HH:MM:SS string"""
    total_seconds = int(td.total_seconds())
    hours = total_seconds // 3600
    minutes = (total_seconds % 3600) // 60
    seconds = total_seconds % 60
    return f"{hours:02d}:{minutes:02d}:{seconds:02d}"

def load_stops():
    """Load stops from stops.txt into a dictionary"""
    stops = {}
    with open('stops.txt', 'r', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        for row in reader:
            stops[row['stop_id']] = {
                'lat': float(row['stop_lat']),
                'lon': float(row['stop_lon']),
                'name': row['stop_name']
            }
    return stops

def load_stop_times():
    """Load stop_times from stop_times.txt"""
    stop_times = []
    with open('stop_times.txt', 'r', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        for row in reader:
            stop_times.append(row)
    return stop_times

def generate_shapes():
    """Generate shapes.txt from stop coordinates"""
    print("Generating shapes.txt...")

    stops = load_stops()
    stop_times = load_stop_times()

    # Group stop_times by trip_id
    trips = {}
    for st in stop_times:
        trip_id = st['trip_id']
        if trip_id not in trips:
            trips[trip_id] = []
        trips[trip_id].append(st)

    # Sort each trip by stop_sequence
    for trip_id in trips:
        trips[trip_id].sort(key=lambda x: int(x['stop_sequence']))

    # Generate shape points for each trip
    shapes = []
    for trip_id, stops_in_trip in trips.items():
        shape_id = trip_id  # Use trip_id as shape_id

        for i, st in enumerate(stops_in_trip):
            stop_id = st['stop_id']
            if stop_id in stops:
                stop_info = stops[stop_id]
                shapes.append({
                    'shape_id': shape_id,
                    'shape_pt_lat': stop_info['lat'],
                    'shape_pt_lon': stop_info['lon'],
                    'shape_pt_sequence': i + 1,
                    'shape_dist_traveled': 0  # Will calculate later
                })

    # Calculate cumulative distances
    shape_groups = {}
    for shape in shapes:
        shape_id = shape['shape_id']
        if shape_id not in shape_groups:
            shape_groups[shape_id] = []
        shape_groups[shape_id].append(shape)

    for shape_id, points in shape_groups.items():
        points.sort(key=lambda x: x['shape_pt_sequence'])
        cumulative_dist = 0

        for i, point in enumerate(points):
            if i > 0:
                prev_point = points[i-1]
                dist = haversine_distance(
                    prev_point['shape_pt_lat'], prev_point['shape_pt_lon'],
                    point['shape_pt_lat'], point['shape_pt_lon']
                )
                cumulative_dist += dist

            point['shape_dist_traveled'] = round(cumulative_dist, 3)

    # Write shapes.txt
    with open('shapes.txt', 'w', encoding='utf-8', newline='') as f:
        fieldnames = ['shape_id', 'shape_pt_lat', 'shape_pt_lon', 'shape_pt_sequence', 'shape_dist_traveled']
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(shapes)

    print(f"[OK] Generated {len(shapes)} shape points for {len(trips)} trips")
    return True

def interpolate_stop_times():
    """Interpolate missing stop times based on distances"""
    print("\nInterpolating stop times...")

    stops = load_stops()
    stop_times = load_stop_times()

    # Group by trip_id
    trips = {}
    for st in stop_times:
        trip_id = st['trip_id']
        if trip_id not in trips:
            trips[trip_id] = []
        trips[trip_id].append(st)

    # Sort each trip by stop_sequence
    for trip_id in trips:
        trips[trip_id].sort(key=lambda x: int(x['stop_sequence']))

    # Interpolate times for each trip
    updated_stop_times = []

    for trip_id, stops_in_trip in trips.items():
        # Calculate distances between consecutive stops
        for i in range(len(stops_in_trip)):
            st = stops_in_trip[i]
            if i > 0:
                prev_st = stops_in_trip[i-1]
                stop_id = st['stop_id']
                prev_stop_id = prev_st['stop_id']

                if stop_id in stops and prev_stop_id in stops:
                    dist = haversine_distance(
                        stops[prev_stop_id]['lat'], stops[prev_stop_id]['lon'],
                        stops[stop_id]['lat'], stops[stop_id]['lon']
                    )
                    st['distance_from_prev'] = dist
                else:
                    st['distance_from_prev'] = 0
            else:
                st['distance_from_prev'] = 0

        # Find first and last stops with times
        first_stop = stops_in_trip[0]
        last_stop = stops_in_trip[-1]

        start_time = parse_time(first_stop['arrival_time'])
        end_time = parse_time(last_stop['arrival_time'])

        if start_time and end_time:
            # Calculate total distance
            total_distance = sum(st['distance_from_prev'] for st in stops_in_trip)

            if total_distance > 0:
                # Interpolate times based on distance proportion
                cumulative_dist = 0

                for st in stops_in_trip:
                    cumulative_dist += st['distance_from_prev']

                    # Calculate time based on distance proportion
                    time_proportion = cumulative_dist / total_distance
                    travel_duration = end_time - start_time
                    interpolated_time = start_time + (travel_duration * time_proportion)

                    # Update arrival and departure times
                    time_str = format_time(interpolated_time)
                    st['arrival_time'] = time_str
                    st['departure_time'] = time_str

                    # Set timepoint to 1 only for first and last stops
                    if st == first_stop or st == last_stop:
                        st['timepoint'] = '1'
                    else:
                        st['timepoint'] = '0'

        updated_stop_times.extend(stops_in_trip)

    # Write updated stop_times.txt
    with open('stop_times.txt', 'w', encoding='utf-8', newline='') as f:
        fieldnames = ['trip_id', 'arrival_time', 'departure_time', 'stop_id', 'stop_sequence',
                     'stop_headsign', 'pickup_type', 'drop_off_type', 'continuous_pickup',
                     'continuous_drop_off', 'shape_dist_traveled', 'timepoint']
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()

        for st in updated_stop_times:
            # Remove our temporary field
            st.pop('distance_from_prev', None)
            writer.writerow(st)

    print(f"[OK] Interpolated times for {len(updated_stop_times)} stop times across {len(trips)} trips")
    return True

def update_trips_with_shapes():
    """Update trips.txt to reference the generated shapes"""
    print("\nUpdating trips.txt with shape references...")

    trips = []
    with open('trips.txt', 'r', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        for row in reader:
            # Set shape_id to trip_id
            row['shape_id'] = row['trip_id']
            trips.append(row)

    # Write updated trips.txt
    with open('trips.txt', 'w', encoding='utf-8', newline='') as f:
        if trips:
            fieldnames = trips[0].keys()
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(trips)

    print(f"[OK] Updated {len(trips)} trips with shape IDs")
    return True

if __name__ == '__main__':
    print("=" * 60)
    print("GTFS DATA ENHANCEMENT TOOL")
    print("=" * 60)
    print("\nThis script will:")
    print("1. Generate shapes.txt from stop coordinates")
    print("2. Interpolate missing stop times based on distances")
    print("3. Update trips.txt with shape references")
    print("\n" + "=" * 60 + "\n")

    try:
        # Step 1: Generate shapes
        generate_shapes()

        # Step 2: Interpolate stop times
        interpolate_stop_times()

        # Step 3: Update trips with shape references
        update_trips_with_shapes()

        print("\n" + "=" * 60)
        print("SUCCESS! All GTFS data has been enhanced.")
        print("=" * 60)
        print("\nGenerated files:")
        print("  - shapes.txt - Route shape geometries")
        print("  - stop_times.txt - Updated with interpolated times")
        print("  - trips.txt - Updated with shape references")
        print("\nYour GTFS feed is now ready for route finding!")

    except Exception as e:
        print(f"\n[ERROR] {e}")
        import traceback
        traceback.print_exc()
