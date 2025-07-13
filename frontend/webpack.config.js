const path = require('path');
const TerserPlugin = require('terser-webpack-plugin');

module.exports = {
  // Entry point is now relative to the frontend folder
  entry: './src/main.js',
  output: {
    filename: 'bundle.js',
    // Output to frontend/dist so Flask can serve at /static
    path: path.resolve(__dirname, 'dist'),
    publicPath: '/static/'
  },
  mode: 'production',
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: { presets: ['@babel/preset-env'] }
        }
      }
    ]
  },
  optimization: {
    minimize: true,
    minimizer: [
      new TerserPlugin({
        terserOptions: { mangle: true, compress: true }
      })
    ]
  }
};
