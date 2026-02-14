const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');

const GTFS_DATA_PATH = path.join(__dirname, '../gtfs_data');

/**
 * Parse a single GTFS file into JSON array
 * @param {string} fileName - Name of the file (e.g., 'stops.txt')
 * @returns {Promise<Array>} Array of parsed data
 */
const parseGTFSFile = (fileName) => {
  return new Promise((resolve, reject) => {
    const filePath = path.join(GTFS_DATA_PATH, fileName);
    const results = [];

    if (!fs.existsSync(filePath)) {
      return reject(new Error(`File not found: ${fileName}`));
    }

    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (row) => {
        // Clone row by creating a new object with all properties
        const clonedRow = {};
        for (const key in row) {
          if (Object.prototype.hasOwnProperty.call(row, key)) {
            clonedRow[key] = row[key];
          }
        }
        results.push(clonedRow);
      })
      .on('end', () => {
        console.log(`✓ Parsed ${fileName}: ${results.length} records`);
        resolve(results);
      })
      .on('error', (error) => {
        console.error(`✗ Error parsing ${fileName}:`, error);
        reject(error);
      });
  });
};

/**
 * Parse all GTFS files in the gtfs_data folder
 * @returns {Promise<Object>} Object containing all parsed GTFS data
 */
const parseAllGTFSFiles = async () => {
  try {
    const gtfsFiles = [
      'agency.txt',
      'stops.txt',
      'routes.txt',
      'trips.txt',
      'stop_times.txt',
      'calendar.txt',
      'calendar_dates.txt',
      'fare_attributes.txt',
      'fare_rules.txt',
      'transfers.txt',
      'shapes.txt',
      'feed_info.txt',
    ];

    const gtfsData = {};

    console.log('\n📂 Parsing GTFS Data Files...');
    console.log('================================');

    for (const file of gtfsFiles) {
      try {
        const data = await parseGTFSFile(file);
        gtfsData[file.replace('.txt', '')] = data;
        if (file === 'stops.txt') {
          console.log(`🎯 STOPS.TXT: Loaded ${data.length} records`);
        }
      } catch (error) {
        console.warn(`⚠️  Skipped ${file}: ${error.message}`);
        // Continue with other files even if one fails
      }
    }

    console.log('================================\n');
    return gtfsData;
  } catch (error) {
    console.error('❌ Error parsing GTFS files:', error);
    throw error;
  }
};

/**
 * Get specific GTFS file data
 * @param {string} fileName - Name of the file without .txt extension
 * @returns {Promise<Array>} Parsed data for the file
 */
const getGTFSData = async (fileName) => {
  try {
    return await parseGTFSFile(`${fileName}.txt`);
  } catch (error) {
    throw new Error(`Failed to get ${fileName} data: ${error.message}`);
  }
};

/**
 * Export GTFS data to JSON file
 * @param {string} fileName - Name of the output JSON file
 * @param {Object} data - Data to export
 */
const exportToJSON = async (fileName, data) => {
  try {
    const outputPath = path.join(__dirname, `../exports/${fileName}.json`);
    
    // Create exports directory if it doesn't exist
    const exportsDir = path.join(__dirname, '../exports');
    if (!fs.existsSync(exportsDir)) {
      fs.mkdirSync(exportsDir, { recursive: true });
    }

    fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));
    console.log(`✓ Exported to ${outputPath}`);
    return outputPath;
  } catch (error) {
    console.error('❌ Export error:', error);
    throw error;
  }
};

/**
 * Get statistics about GTFS data
 * @param {Object} gtfsData - GTFS data object
 * @returns {Object} Statistics
 */
const getGTFSStats = (gtfsData) => {
  const stats = {};
  
  for (const [key, data] of Object.entries(gtfsData)) {
    stats[key] = {
      recordCount: Array.isArray(data) ? data.length : 0,
      fields: Array.isArray(data) && data.length > 0 ? Object.keys(data[0]) : [],
    };
  }

  return stats;
};

module.exports = {
  parseGTFSFile,
  parseAllGTFSFiles,
  getGTFSData,
  exportToJSON,
  getGTFSStats,
};
