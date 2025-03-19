const os = require('os');
const config = require('./config');
const express = require('express');

let requests = 0;
let latency = 0;
let purchaseMetrics = {
  count: 0,
  totalCost: 0,
  failures: 0,
  responseTimes: [],
};

function requestTracker(req, res, next) {
  const startTime = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    requests++;
    latency += duration;
    sendMetricToGrafana('requests', requests, 'sum', '1');
    sendMetricToGrafana('latency', latency, 'sum', 'ms');
  });

  next();
}

function getCpuUsagePercentage() {
  const cpuUsage = os.loadavg()[0] / os.cpus().length;
  return (cpuUsage * 100).toFixed(2);
}

function getMemoryUsagePercentage() {
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const usedMemory = totalMemory - freeMemory;
  return ((usedMemory / totalMemory) * 100).toFixed(2);
}

function trackPurchase(order) {
  const startTime = Date.now();
  const pizzaCount = order.pizzas;
  const cost = order.totalCost;
  const isSuccess = pizzaCount <= 20;

  setTimeout(() => {
    const responseTime = Date.now() - startTime;

    purchaseMetrics.count++;
    purchaseMetrics.totalCost += cost;
    purchaseMetrics.responseTimes.push(responseTime);
    
    if (!isSuccess) {
      purchaseMetrics.failures++;
    }

    sendMetricToGrafana('purchase_count', purchaseMetrics.count, 'sum', '1');
    sendMetricToGrafana('total_cost', purchaseMetrics.totalCost, 'sum', 'USD');
    sendMetricToGrafana('purchase_failures', purchaseMetrics.failures, 'sum', '1');
    sendMetricToGrafana('purchase_response_time', responseTime, 'gauge', 'ms');
  }, Math.random() * 2000);
}

function sendMetricsPeriodically(period) {
  setInterval(() => {
    try {
      sendMetricToGrafana('cpu_usage', getCpuUsagePercentage(), 'gauge', '%');
      sendMetricToGrafana('memory_usage', getMemoryUsagePercentage(), 'gauge', '%');

      if (purchaseMetrics.responseTimes.length > 0) {
        const avgResponseTime = purchaseMetrics.responseTimes.reduce((a, b) => a + b, 0) / purchaseMetrics.responseTimes.length;
        sendMetricToGrafana('avg_purchase_response_time', avgResponseTime.toFixed(2), 'gauge', 'ms');
        purchaseMetrics.responseTimes = [];
      }
    } catch (error) {
      console.error('Error sending metrics', error);
    }
  }, period);
}

function sendMetricToGrafana(metricName, metricValue, type, unit) {
  const metric = {
    resourceMetrics: [
      {
        scopeMetrics: [
          {
            metrics: [
              {
                name: metricName,
                unit: unit,
                [type]: {
                  dataPoints: [
                    {
                      asInt: metricValue,
                      timeUnixNano: Date.now() * 1000000,
                    },
                  ],
                },
              },
            ],
          },
        ],
      },
    ],
  };

  if (type === 'sum') {
    metric.resourceMetrics[0].scopeMetrics[0].metrics[0][type].aggregationTemporality = 'AGGREGATION_TEMPORALITY_CUMULATIVE';
    metric.resourceMetrics[0].scopeMetrics[0].metrics[0][type].isMonotonic = true;
  }

  const body = JSON.stringify(metric);
  fetch(`${config.url}`, {
    method: 'POST',
    body: body,
    headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
  })
    .then((response) => {
      if (!response.ok) {
        response.text().then((text) => {
          console.error(`Failed to push metrics data to Grafana: ${text}\n${body}`);
        });
      } else {
        console.log(`Pushed ${metricName}`);
      }
    })
    .catch((error) => {
      console.error('Error pushing metrics:', error);
    });
}

sendMetricsPeriodically(5000);

module.exports = {
  requestTracker,
  trackPurchase,
};
