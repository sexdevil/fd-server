/**
*@description 服务主线程入口
*@updateTime 2014-02-20/10
*/

var fs = require("fs");
var child_process = require('child_process');
var fileListen = false;

var vhosts = {
    module: "./test/server/vhosts",
    process: null,
    list: []
};
var proxy = {
    module: "./test/server/proxy",
    process: null,
    list: []
};

/**
*@description 获取配置信息并启动server/更新server
*@param options {
        configFile: "",//服务配置文件路径
        appHost: "" //express服务需要的域名和端口
    }
*/
function startup(options){
    var path = options.configFile;
    var appHost = options.appHost;
    fs.exists(path, function (t){
        if(t){
            //添加监听文件更新事件
            if(!fileListen){
                fs.watchFile(path,function (curr, prev){
                    if(curr.mtime > prev.mtime){
                        console.log("config file update~! " + path);
                        startup(options);
                    }
                });
                fileListen = true;
            }
            //读取文件内容
            fs.readFile(path, {encoding: "utf8"}, function (err, data){
                if(err){
                    throw err;
                }
                var obj = JSON.parse(data);
                
                //处理数据，然后更新服务
                if(dealData(obj)){
                    updateVhostsServer();
                    updateProxyServer();
                }
            });
        }else{
            console.warn("file not found. " + path);
        }
    });
    
    function dealData(data){
        if(data){
            var vhostsCfg = data.vhost;
            var proxyCfg = data.proxy;
            var i, k, item, domain, path;
            
            //初始化vhost配置数据
            vhosts.list = [];
            if(appHost){
                appHost.onlyRoute = true;
                vhosts.list.push(appHost);
            }
            for(domain in vhostsCfg){
                vhosts.list.push({
                    path: vhostsCfg[domain],
                    domain: domain
                });
            }
            
            //处理代理服务配置数据
            proxy.list = [];
            for(i = 0; i < proxyCfg.length; i++){
                item = proxyCfg[i];
                proxy.list.push({
                    pattern: item.pattern,
                    responder: item.responder
                });
            }
            
            return true;
        }
        return false;
    } 
}

/**
*更新本地静态服务。同代理
*/
function updateVhostsServer(){
    //vhosts线程处理
    if(vhosts.list && vhosts.list.length > 0){
        vhosts.process = vhosts.process || child_process.fork(vhosts.module);
        vhosts.process.send({
            type: "update",
            options: [vhosts.list]
        });
    }else if(vhosts.process){
        //不存在代理服务时，中断已开启的代理服务
        process.kill(vhosts.process.pid, 'SIGHUP');
    }
}

/**
*更新代理服务。存在代理规则，便开启一个代理服务线程，并将代理规则列表传递给该线程；不存在但已开启过代理服务，则中断已开启的代理服务，否则不处理。
*/
function updateProxyServer(){
    //proxy线程处理
    if(proxy.list && proxy.list.length > 0){
        proxy.process = proxy.process || child_process.fork(proxy.module);
        proxy.process.send({
            type: "update",
            options: [proxy.list]
        });
    }else if(proxy.process){
        //不存在代理服务时，中断已开启的代理服务
        process.kill(proxy.process.pid, 'SIGHUP');
    }
}

// process.on('uncaughtException', function(err){
  // console.error('uncaughtException: ' + err.message);
// });
//监听进程中断信号，然后延迟一秒退出，便于关闭相关服务
process.on('SIGINT', function() {
  console.log('The service will be closed~!');
  // setTimeout(process.exit, 1000);
  setTimeout(function (){
    console.log("The service process has exited~!");
    process.exit();
  }, 800);
});

exports.start = startup;