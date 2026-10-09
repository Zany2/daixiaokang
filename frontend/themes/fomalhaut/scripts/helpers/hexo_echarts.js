// 标签统计柱状图
hexo.extend.helper.register('tag_ranking_bar', function (options) {
    const { type, id, topNum, title, color, yAxisName, seriesName } = options
    // 【2026-10-01 新增】titlePosition: 'outside' 时不在图表内部画标题（标题改由页面模板放在图表外面）
    const showTitle = options.titlePosition !== 'outside'
    // id 和 type 必须指定
    if (!id || !type) return
    // 获取 tags 标签页信息
    const tagArr = []
    hexo.locals.get('tags').map(function (tag) {
        tagArr.push([tag.name, tag.length])
    })
    // 对数组进行排序，然后取  top 10
    // 按文章数降序（x[1]/y[1] 才是 tag.length；原写法 y[0]-x[0] 是字符串相减得 NaN，排序无效）
    tagArr.sort((x, y) => y[1] - x[1] || String(x[0]).localeCompare(String(y[0]), 'zh'))
    const echarts_obj = {
        tag: tagArr.slice(0, topNum)
    }
    return `
    <script type="text/javascript" id="${id}-script">
    var themeMode = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'
    var tagsChart = echarts.init(document.getElementById("${id}"),themeMode);

    // 指定图表的配置项和数据
    var tagsOption = {
        color: "${color}",
        backgroundColor: '',
        title: {
            show: ${showTitle},
            text: "${title}",
            x: 'center'
        },
        dataset: [
            {
                dimensions: ['name', 'count'],
                source: ${JSON.stringify(echarts_obj[type])}
            },
            {
                transform: {
                    type: 'sort',
                    config: { dimension: 'count', order: 'desc' }
                }
            }
        ],
        tooltip: {},
        xAxis: {
            type: 'category'
        },
        yAxis: {
            name: "${yAxisName}",
            type: 'value',
            splitLine: {
                show: false
            },
            axisTick: {
                show: false
            },
            axisLine: {
                show: true
            }
        },
        series: {
            name: "${seriesName}",
            type: 'bar',
            encode: { x: 'name', y: 'count' },
            datasetIndex: 1,
            itemStyle: {
        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: '#83bff6' },
          { offset: 0.5, color: '#188df0' },
          { offset: 1, color: '#188df0' }
        ])
      },
      emphasis: {
        itemStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: '#2378f7' },
            { offset: 0.7, color: '#2378f7' },
            { offset: 1, color: '#83bff6' }
          ])
        }
      },
            markPoint: {
                symbolSize: 45,
                data: [
                    {
                        type: 'max',
                        itemStyle: { color: '#425aef' },
                        name: '最大值'
                    },
                    {
                        type: 'min',
                        itemStyle: { color: '#425aef' },
                        name: '最小值'
                    }
                ]
            },
            markLine: {
                itemStyle: { color: '#425aef' },
                label: { position: 'insideEndTop', distance: 8, formatter: '平均 {c}' },
                data: [{ type: 'average', name: '平均值' }]
            }
        }
    };
    // 使用刚指定的配置项和数据显示图表。
    tagsChart.setOption(tagsOption);
    </script>`
})


hexo.extend.helper.register('categories_pic', function (options) {
    const { id, title, seriesName } = options
    // 【2026-10-01 新增】titlePosition: 'outside' 时不在图表内部画标题
    const showTitle = options.titlePosition !== 'outside'
    // id  必须指定
    if (!id) return
    const categoryArr = []
    hexo.locals.get('categories').map(function (category) {
        categoryArr.push({ name: category.name, value: category.length })
    })
    return `
    <script type="text/javascript" id="${id}-script">
    var themeMode = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'
    var categoriesChart = echarts.init(document.getElementById("${id}"),themeMode);
    // 指定图表的配置项和数据
    var categoriesOption = {
        backgroundColor:'',
        title:{
            show: ${showTitle},
            text:'${title}',
            x:'center'
        },
        tooltip:{
            formatter: "{a} <br/>{b} : {c} ({d}%)"
        },
        legend: {
            icon: "circle",
            top: 'bottom'
        },
        series: [
            {
            name: '${seriesName}',
            type: 'pie',
            radius: [40, 150],
            center: ['50%', '48%'],
            roseType: 'area',
            itemStyle: {
                borderRadius: 8
            },
            label: {
                formatter: "{b} : {c} ({d}%)"
            },
            data: ${JSON.stringify(categoryArr)}
            }
        ]
        };
    // 使用刚指定的配置项和数据显示图表。
    categoriesChart.setOption(categoriesOption);
    </script>`
})


hexo.extend.helper.register('posts_echarts', function (options) {
    let { title, id, seriesName } = options
    // 【2026-10-01 新增】titlePosition: 'outside' 时不在图表内部画标题
    const showTitle = options.titlePosition !== 'outside'
    var moment = require('moment');
    // 含当前月的最近 12 个月；按月份递增，不对 Moment 对象做 += 运算。
    const endDate = moment().startOf('month')
    const startDate = endDate.clone().subtract(11, 'months')

    const monthMap = new Map()
    for (const time = startDate.clone(); time.valueOf() <= endDate.valueOf(); time.add(1, 'month')) {
        monthMap.set(time.format('YYYY-MM'), 0)
    }
    hexo.locals.get('posts').forEach(function (post) {
        const month = post.date.format('YYYY-MM')
        if (monthMap.has(month)) {
            monthMap.set(month, monthMap.get(month) + 1)
        }
    })
    const postsArr = [...monthMap.entries()]
    return `
  <script type="text/javascript" id="${id}-script">
    var themeMode = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'
    var postsChart = echarts.init(document.getElementById("${id}"),themeMode);
    // PJAX 会重复执行内联脚本，var 允许重入，避免全局 let 重复声明。
    var postsOption = {
        color: ['#425aef'],
        title:{
          show: ${showTitle},
          text:'${title}',
          x:'center'
        },
        tooltip:{
            trigger: 'axis',
               axisPointer: {
                   type: 'shadow',
                   shadowStyle:{
                     color:'rgba(66,90,239,0.3)'
                   }
               },
         },
        xAxis: {
          type: 'category',
          boundaryGap: false,
          data: ${JSON.stringify(postsArr.map(item => item[0]))}
        },
        yAxis: {
          name:'${seriesName}',
          type: 'value',
          minInterval: 1,
          axisLine: {
            show: true
          }
        },
        series: [
          {
            name:'${seriesName}',
            type: 'line',
            smooth:true,
            symbol: 'circle',
            symbolSize: 6,
            showSymbol: false,
            lineStyle: {
              color: '#425aef',
              width: 1
            },
            areaStyle: {
              color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{
                      offset: 0,
                      color: '#425aef',
                  }, {
                      offset: 1,
                      color: '#FFFFFF'
                  }])
            },
            data: ${JSON.stringify(postsArr.map(item => item[1]))}
          }
        ]
      };
    postsChart.setOption(postsOption);
    </script>`
})
