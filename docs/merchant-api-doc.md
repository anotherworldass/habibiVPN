# 商户对接文档

> 来源：http://150.5.128.214/doc
>
> 请注意：如若您对接有问题，配合请求实列体验更佳。

## 支付对接

### 支付下单接口(支付网关)

1、http提交方式：x-www-form-urlencoded  （post请求）

2、提交地址：http://150.5.128.214/apid/newbankPay/crtOrder.do 提交参数，有些参数可以为空，但必须传入

请求示例：

```
{
"payName": "测试" ,
"appId": "1" ,
"appOrderNo": "A7MR-6BCIDI1732449379216" ,
"orderAmt": "12.00" ,
"payId": "404" ,
"sign": "109279774AFB399CFEC1C7BC03F32B34" ,
"jumpURL": "https://www.baidu.com" ,
"notifyURL": "https://www.baidu.com"
}
```

| 参数名称 | 参数名 | 类型 | 可空 | 是否参与签名 | 说明 |
| --- | --- | --- | --- | --- | --- |
| 商户账户 | appId | string | 否 | 是 | 商户号，管理后台查看 |
| 订单号 | appOrderNo | string | 否 | 是 | 32个字符以内 |
| 金额 | orderAmt | string | 否 | 是 | 金额（单位：元，精确到小数点后两位） |
| 支付类型 | payId | string | 否 | 是 | 具体咨询客服 |
| 异步回调地址 | notifyURL | string | 否 | 否 | 用户支付成功后回调地址 |
| 跳转地址 | jumpURL | string | 是 | 否 | 用户提交支付订单后跳转地址 |
| 付款人姓名 | payName | string | 看说明 | 否 | 付款人姓名，支付类型为1113、1114不能为空 |
| 扩展字段 | extParams | string | 否 | 否 | 是否传参，传什么参，请参考【各国接口差异补充】 |
| 签名 | sign | string | 否 | 否 | 按字典顺序排序，Md5加密32位大写，签名串示例：appId=20081160 & appOrderNo=123132132124& orderAmt=100.00& payId=1114& key=E5681D9605EA1688239482C27037AD96 |

3、下单返回

```
{
"code": 200 ,
"msg": "success" ,
"data": {
"orderNo": "NO12170648375234" ,
"appOrderNo": "123132132123" ,
"sign": "54548E6E553790D33290213C1DE47F06" ,
"payUrl": "http://13.72.210.52:8080//#/WinPay_101?appId=20081160&orderNo=NO12170648375234"
}
}
```

| 参数名称 | 参数名 | 类型 | 可空 | 说明 |
| --- | --- | --- | --- | --- |
| 状态码 | code | Int | 否 | 200表示下单成功，其他均为失败 |
| 描述信息 | msg | string | 否 | 当下单失败时，作为失败信息提示 |
| 订单信息 | data | object | 否 | 当订单失败时候，返回null；下单成功时候，返回订单信息（ orderNo=支付系统订单号 appOrderNo=商户订单号 sign=签名 payUrl=支付链接 ） |

### 支付回调接口

通知数据类型：form表单类型 通知请求方式：post

通知参数：

回调示例：

```
{
"appOrderNo": "PAY202401010001" ,
"orderNo": "NO12171358151243" ,
"gcashOrder": "GC123456789" ,
"orderTime": "20240101123456" ,
"appId": "20081160" ,
"orderAmt": "1000.00" ,
"payAmt": "1000.00" ,
"orderFee": "10.00" ,
"orderStatus": "00" ,
"sign": "MD5签名值"
}
```

| 参数名称 | 参数名 | 类型 | 可空 | 参与签名 | 说明 |
| --- | --- | --- | --- | --- | --- |
| 商户单号 | appOrderNo | string | 否 | 是 | 商户自己系统的业务单号 |
| 平台单号 | orderNo | string | 否 | 是 | 支付平台的单号 |
| gcash订单号 | gcashOrder | string | 是 | 否 | 会员输入的 gcash 订单号 |
| 支付完成时间 | orderTime | string | 否 | 是 | 格式 yyyyMMddHHmmss，例如：20211217072615 |
| 商户号 | appId | string | 否 | 是 | 商户号 |
| 订单金额 | orderAmt | string | 否 | 是 | 和提交时金额一致，参与签名需要保留两位小数 |
| 订单实际金额 | payAmt | string | 否 | 是 | 用户实际支付金额，参与签名需要保留两位小数 |
| 订单手续费 | orderFee | string | 否 | 否 | 订单手续费，参与签名需要保留两位小数 |
| 支付状态 | orderStatus | string | 否 | 是 | 00-支付成功 01-待支付 02-支付超时 99-支付失败 |
| 签名 | sign | string | 否 | 否 | 按字典顺序排序，Md5加密32位大写，示例：appId=20081160&appOrderNo=131233f1d3sa2f1a2&orderAmt=10.00&orderNo=NO12171358151243&orderStatus=00&orderTime=20211217135815&payAmt=9.87&key=E5681D9605EA168823948E5681D9605EA1688239482C27037AD96 |

判断订单是否支付成功不需要判断实际支付金额，只需要判断orderStatus字段，收到回调处理完业务之后请输出固定的大写 SUCCESS ，如果通知失败，系统最多连续通知三次

### 支付订单查询接口

1、http提交方式：x-www-form-urlencoded  （get请求）

2、提交地址：http://150.5.128.214/apid/newbankPay/selOrder.do

提交参数

请求示例：

```
{
"appId": "20081160" ,
"appOrderNo": "PAY202401010001" ,
"sign": "MD5签名值"
}
```

| 参数名称 | 参数名 | 类型 | 可空 | 是否参与签名 | 说明 |
| --- | --- | --- | --- | --- | --- |
| 商户号 | appId | string | 否 | 是 | 商户号，管理后台查看 |
| 商户单号 | appOrderNo | string | 否 | 是 | 商户自己系统的业务单号 |
| 签名 | sign | string | 否 | 否 | 按字典顺序排序，Md5加密32位大写，签名串示例：appId=20081160&appOrderNo=164508727200&key=E5681D9605EA1688239482C27037AD96 |

3、查询返回订单相关信息和状态

```
{
"code": 200 ,
"msg": "success" ,
"data": {
"orderNo": "NO12170726151195" ,
"appOrderNo": "1321321fafwrq" ,
"orderTime": "20211217072615" ,
"sign": "E9785F22B0F5BC26461E235F22F0041B" ,
"orderStatus": "00" ,
"orderAmt": "50.00" ,
"payAmt": "49.83"
}
}
```

| 参数名称 | 参数名 | 类型 | 可空 | 说明 |
| --- | --- | --- | --- | --- |
| 状态码 | code | Int | 否 | 200 表示下单成功，其他均为失败 |
| 描述信息 | msg | string | 否 | 当下单失败时，作为失败信息提示 |
| 订单信息 | data | object | 否 | 当订单失败时候，返回null；下单成功时候，返回订单信息（ orderNo=支付系统订单号 appOrderNo=商户订单号 sign=签名 orderAmt=订单出款金额 orderFee=订单手续费 ） |

## 代付对接

### 代付下单接口(代付网关)

1、http提交方式：x-www-form-urlencoded  （post请求）

2、提交地址：http://150.5.128.214/apid/newbankPay/crtAgencyOrder.do 提交参数，有些参数可以为空，但必须传入

请求示例：

```
{
"appId": "20476395" ,
"appOrderNo": "DF202401010001" ,
"orderAmt": "1000.00" ,
"payId": "401" ,
"accNo": "6222021234567890123" ,
"accName": "张三" ,
"bankName": "中国工商银行" ,
"notifyURL": "http://your-domain.com/notify/df" ,
"sign": "MD5签名值"
}
```

| 参数名称 | 参数名 | 类型 | 可空 | 是否参与签名 | 说明 |
| --- | --- | --- | --- | --- | --- |
| 商户账户 | appId | string | 否 | 是 | 商户号，管理后台查看 |
| 订单号 | appOrderNo | string | 否 | 是 | 32 个字符以内 |
| 金额 | orderAmt | string | 否 | 是 | 金额（单位：元，精确到小数点后两位，如：100 传 100.00），参与签名的时候保留两位小数 |
| 代付类型 | payId | string | 否 | 是 | 具体咨询客服 |
| 出款账号 | accNo | string | 是 | 是 | 银行卡号；若为usdt代付 则填TRC20地址 |
| 出款账号姓名 | accName | string | 是 | 是 | 银行卡号姓名 |
| 银行编码 | bankCode | string | 是 | 非空则参与 | 银行编码，是否为空请看各国差异; |
| 银行名称 | bankName | string | 是 | 是 | 代付类型 payId 为 401 传银行名称，若为usdt代付 则填：USDT |
| 异步回调地址 | notifyURL | string | 否 | 是 | 代付成功后回调地址 |
| 扩展字段 | extParams | string | 否 | 否 | json字段，是否传参及数据接口请参考【各国接口差异补充】 |
| 签名 | sign | string | 否 | 否 | 按字典顺序排序，Md5加密32位大写，签名串示例： accName=jishu&accNo=621788888&appId=20476395&appOrderNo=20476395-20211224b&bankName=建设&orderAmt=20.00&payId=401&key=51BE5FA9394B040BFCF43D56ACA61ABE |

3、下单返回

```
{
"code": 200 ,
"msg": "success" ,
"data": {
"orderNo": "NO12240708167259" ,
"appOrderNo": "20476395-20211224b" ,
"sign": "B0CAA194E9652205BFE2EE4C0AA3C519" ,
"orderFee": 1.9 ,
"orderAmt": 20
}
}
```

| 参数名称 | 参数名 | 类型 | 可空 | 说明 |
| --- | --- | --- | --- | --- |
| 状态码 | code | Int | 否 | <span style='color: red'>200 表示下单成功，其他均为失败</span> |
| 描述信息 | msg | string | 否 | 当下单失败时，作为失败信息提示 |
| 订单信息 | data | object | 否 | 当订单失败时候，返回null；下单成功时候，返回订单信息（ orderNo=支付系统订单号 appOrderNo=商户订单号 sign=签名 orderAmt=订单出款金额 orderFee=订单手续费 ） |

### 代付回调接口

通知数据类型：form表单类型

通知请求方式：post

通知参数：

回调示例：

```
{
"appOrderNo": "DF202401010001" ,
"orderNo": "NO12250111272205" ,
"orderTime": "20240101123456" ,
"appId": "20476395" ,
"orderAmt": "1000.00" ,
"orderFee": "5.00" ,
"orderStatus": "02" ,
"sign": "MD5签名值"
}
```

| 参数名称 | 参数名 | 类型 | 可空 | 参与签名 | 说明 |
| --- | --- | --- | --- | --- | --- |
| 商户单号 | appOrderNo | string | 否 | 是 | 商户自己系统的业务单号 |
| 平台单号 | orderNo | string | 否 | 是 | 支付平台的单号 |
| 支付完成时间 | orderTime | string | 否 | 是 | 格式 yyyyMMddHHmmss，例如：20211217072615 |
| 商户号 | appId | string | 否 | 是 | 商户号 |
| 订单金额 | orderAmt | float | 否 | 是 | 和提交时金额一致 |
| 订单手续费 | orderFee | float | 否 | 是 | 订单手续费 |
| 支付状态 | orderStatus | string | 否 | 是 | 00-待审核 01-出款中 02-出款成功 99-出款失败 |
| 签名 | sign | string | 否 | 否 | 按字典顺序排序，Md5加密32位大写，示例： appId=20476395&appOrderNo=sad 123&orderAmt=20.00&orderFee=12.00&orderNo=NO12250111272205&orderStatus=02&orderTime=20211225011127&key=51BE5FA9394B040BFCF43D56ACA61AB |

判断订单是否支付成功不需要判断实际支付金额，只需要判断orderStatus字段，收到回调处理完业务之后请输出固定的大写 SUCCESS ，如果通知失败，系统最多连续通知三次

### 代付订单查询接口

1、http提交方式：x-www-form-urlencoded  （get请求）

2、提交地址：http://150.5.128.214/apid/newbankPay/selAgencyOrder.do

提交参数

请求示例：

```
{
"appId": "20476395" ,
"appOrderNo": "DF202401010001" ,
"sign": "MD5签名值"
}
```

| 参数名称 | 参数名 | 类型 | 可空 | 参与签名 | 说明 |
| --- | --- | --- | --- | --- | --- |
| 商户号 | appId | string | 否 | 是 | 商户号，管理后台查看 |
| 商户单号 | appOrderNo | string | 否 | 是 | 商户自己系统的业务单号 |
| 签名 | sign | string | 否 | 否 | 按字典顺序排序，Md5加密32位大写，签名串示例： appId=20081160&appOrderNo=164508727200&key=E5681D9605EA1688239482C27037AD96 |

3、查询返回代付订单相关信息和状态

```
{
"code": 200 ,
"msg": "success" ,
"data": {
"orderNo": "NO02171640367860" ,
"appOrderNo": "164508727200" ,
"orderTime": "2022-02-17 16:40:36" ,
"appId": "20599410" ,
"sign": "FA5F2B2C55A3EB4F96768540A091D25C" ,
"orderStatus": "03" ,
"orderAmt": "100.00"
} ,
"bizErrorMsg": "出款失败:余额不足"
}
```

注意：orderStatus只有等于02时是代付成功，orderStatus只有等于99时是代付失败，其他状态属于系统在处理中。

查询返回参数描述：

| 参数名称 | 参数名 | 类型 | 可空 | 说明 |
| --- | --- | --- | --- | --- |
| 状态码 | code | Int | 否 | 200 表示查询成功，其他均为失败 |
| 描述信息 | msg | string | 否 | 查询失败时，作为失败信息提示 |
| 业务错误原因描述 | bizErrorMsg | string | 是 | 业务失败的时候(orderStatus为99)，显示错误原因，不参与签名 |
| 订单信息 | data | object | 否 | 当查单失败时候，返回null；查单成功时候，返回订单信息（ orderNo=支付系统订单号 appOrderNo=商户订单号 orderTime=代付完成时间，格式YmdHis，如：yyyyMMddHHmmss appId=商户号 sign=签名 orderStatus=代付状态，00-未审核 01-审核中 02-出款成功 03-出款中 99-出款失败 orderAmt=订单代付金额，和提交时金额一致 ） |

### 代付订单反查接口

1、http提交方式：x-www-form-urlencoded

2、请在商户后台-基本管理-安全设置-填写贵公司的代付订单反查地址，位置： 基本管理->安全设置->订单回查地址(点击修改)

3、描述： 系统在对代付订单进行出款时，会对商户提供的反查接口发起http请求进行查询订单核实，避免造成他人伪造提交的订单造成商户资金损失，如果没有配置反查地址忽略反查这个步骤。

提交参数

请求示例：

```
{
"appId": "20599410" ,
"appOrderNo": "DF202401010001" ,
"sign": "MD5签名值"
}
```

| 参数名称 | 参数名 | 类型 | 可空 | 是否参与签名 | 说明 |
| --- | --- | --- | --- | --- | --- |
| 商户号 | appId | string | 否 | 是 | 商户号 |
| 商户单号 | appOrderNo | string | 否 | 是 | 商户提交的代付订单号 |
| 签名 | sign | string | 否 | 否 | 按字典顺序排序，Md5加密32位大写，签名串示例： appId=20599410&appOrderNo=NO030552056169652772&key=3487730486DAC49370F7F77032D6A4 |

4、反查返回信息示例

```
{
"code": 200 ,
"msg": "success" ,
"orderNo": "No4523313145454" ,
"accNo": "6228482002000" ,
"amt": 95.56
}
```

反查接口返回参数描述：

| 参数名称 | 参数名 | 类型 | 可空 | 说明 |
| --- | --- | --- | --- | --- |
| 状态码 | code | Int | 否 | 200 表示查询成功，其他均为失败 |
| 描述信息 | msg | string | Code 等于 200 时可为空 | 查询失败时，作为失败信息提示 |
| 商户代付订单号 | orderNo | string | Code 等于 200 时不可空 | 商户代付订单号，在商户平台唯一的订单号 |
| 出款账号 | accNo | string | Code 等于 200 时不可空 | 代付订单出款账号或出款 USDT 地址 |
| 出款金额 | amt | string | Code 等于 200 时不可空 | 代付订单出款金额 |

## 通用

### 查询商户余额接口

1、http提交方式：x-www-form-urlencoded  （get请求）

2、提交地址：http://150.5.128.214/apid/newbankPay/selUser.do

请求示例：

```
{
"appId": "20130758" ,
"time": "1649584762976" ,
"sign": "MD5签名值"
}
```

提交参数

| 参数名称 | 参数名 | 类型 | 可空 | 是否参与签名 | 说明 |
| --- | --- | --- | --- | --- | --- |
| 商户号 | appId | string | 否 | 是 | 商户号，管理后台查看 |
| 时间戳 | time | string | 否 | 是 | 13 位时间戳 |
| 签名 | sign | string | 否 | 否 | 按字典顺序排序，Md5加密32位大写，签名串示例： appId=20130758&time=1649584762976&key=ECC4388641D01282DB6172071D30B3FC |

```
{
"code": 200 ,
"msg": "success" ,
"data": {
"appId": "20130758" ,
"sign": "01BDCDF9B41FDE4381BB4EEBE88129E7" ,
"amt": "100.00" ,
"userName": "测试2"
}
}
```

查询返回参数描述：

| 参数名称 | 参数名 | 类型 | 可空 | 说明 |
| --- | --- | --- | --- | --- |
| 状态码 | code | Int | 否 | 200 表示查询成功，其他均为失败 |
| 描述信息 | msg | string | 否 | 查询失败时，作为失败信息提示 |

## 请求示例：

### 代付下单

POST 表单请求 (请注意请求格式 下方的请求参数只是显示为json格式方便查看,不代表请求格式为json)

请注意演示都为沙盒环境，请您在实际对接中替换正确的请求地址

商户名称：仅用于对接文档测试商户

测试商户号：2020022101

测试商户号密钥：9ddc5edd3226456da527fdf63c072649

请求地址：http://150.5.128.191/apid/newbankPay/crtAgencyOrder.do （当前请求域名为沙盒环境，请您注意替换为正式环境）

点击提交订单即可打印参与签名字符串以及加密结果（具体参数注释请查看上方对接文档,但我相信您看到表单标题即可明白一切）

请求参数：表单格式 表单格式 表单格式 重要的事情说三遍 x-www-form-urlencoded👇

```
{
"accNo": "测试" ,
"accName": "测试" ,
"bankName": "测试" ,
"payId": "403" ,
"appId": "2020022101" ,
"orderAmt": "12.00" ,
"sign": "" ,
"notifyURL": "https://www.google.com/?hl=zh_CN"
}
```

参与签名字符串:👇

签名结果:👇 参与签名字符串->按字典顺序排序，Md5加密32位大写

商户号

商户密钥

出款账号

出款账号姓名

银行名称

代付方式

银行卡出款

金额

异步回调地址

提单响应

响应结果: 

```
{
}
```

提交订单复制

### 代付订单查询

GET请求

请注意演示都为沙盒环境，请您在实际对接中替换正确的请求地址

商户名称：仅用于对接文档测试商户

测试商户号：2020022101

测试商户号密钥：9ddc5edd3226456da527fdf63c072649

请求地址：http://150.5.128.191/apid/newbankPay/selAgencyOrder.do （当前请求域名为沙盒环境，请您注意替换为正式环境）

点击提交订单即可打印参与签名字符串以及加密结果（具体参数注释请查看上方对接文档,但我相信您看到表单标题即可明白一切）

请求参数：👇

```
{
"appId": "2020022101" ,
"key": "9ddc5edd3226456da527fdf63c072649" ,
"appOrderNo": "" ,
"orderNo": ""
}
```

参与签名字符串:👇

签名结果:👇 参与签名字符串->按字典顺序排序，Md5加密32位大写

商户号

商户密钥

商户订单号

提单响应

响应结果: 

```
{
}
```

提交查询复制

### 支付下单

POST 表单请求 (请注意请求格式 下方的请求参数只是显示为json格式方便查看,不代表请求格式为json)

请注意演示都为沙盒环境，请您在实际对接中替换正确的请求地址

商户名称：仅用于对接文档测试商户

测试商户号：2020022104

测试商户号密钥：377832138d684d69bc53e4d21ecc9a10

请求地址：http://150.5.128.191/apid/newbankPay/crtOrder.do （当前请求域名为沙盒环境，请您注意替换为正式环境）

点击提交订单即可打印参与签名字符串以及加密结果（具体参数注释请查看上方对接文档,但我相信您看到表单标题即可明白一切）

请求参数：沙盒环境支付类型(仅提供890，具体咨询客服)表单格式 表单格式 表单格式 重要的事情说三遍 x-www-form-urlencoded👇

```
{
"appId": "2020022104" ,
"appOrderNo": "A7MR-6BCIDI1732449379216" ,
"bankName": "测试" ,
"orderAmt": "12.00" ,
"payId": "890" ,
"sign": "" ,
"jumpURL": "https://www.baidu.com" ,
"notifyURL": "https://www.baidu.com" ,
"payName": "测试"
}
```

参与签名字符串:👇

签名结果:👇 参与签名字符串->按字典顺序排序，Md5加密32位大写

商户号

商户密钥

付款人姓名

支付类型

（测试仅提供890，具体咨询客服）

跳转地址

异步回调地址

金额

提单响应

响应结果: 

```
{
}
```

提交订单复制

### 支付订单查询

GET请求

请注意演示都为沙盒环境，请您在实际对接中替换正确的请求地址

商户名称：仅用于对接文档测试商户

测试商户号：2020022104

测试商户号密钥：377832138d684d69bc53e4d21ecc9a10

请求地址：http://150.5.128.191/apid/newbankPay/selOrder.do （当前请求域名为沙盒环境，请您注意替换为正式环境）

点击提交订单即可打印参与签名字符串以及加密结果（具体参数注释请查看上方对接文档,但我相信您看到表单标题即可明白一切）

请求参数：👇

```
{
"appId": "2020022101" ,
"key": "9ddc5edd3226456da527fdf63c072649" ,
"appOrderNo": "" ,
"orderNo": ""
}
```

参与签名字符串:👇

签名结果:👇 参与签名字符串->按字典顺序排序，Md5加密32位大写

商户号

商户密钥

商户订单号

提单响应

响应结果: 

```
{
}
```

提交查询复制

### 查询商户余额

GET请求

请注意演示都为沙盒环境，请您在实际对接中替换正确的请求地址

商户名称：仅用于对接文档测试商户

测试商户号：2020022104

测试商户号密钥：377832138d684d69bc53e4d21ecc9a10

请求地址：http://150.5.128.191/apid/newbankPay/selUser.do （当前请求域名为沙盒环境，请您注意替换为正式环境）

点击提交订单即可打印参与签名字符串以及加密结果（具体参数注释请查看上方对接文档,但我相信您看到表单标题即可明白一切）

请求参数：👇

```
{
"appId": "2020022101" ,
"key": "9ddc5edd3226456da527fdf63c072649" ,
"appOrderNo": "" ,
"orderNo": ""
}
```

参与签名字符串:👇

签名结果:👇 参与签名字符串->按字典顺序排序，Md5加密32位大写

商户号

商户密钥

提单响应

响应结果: 

```
{
}
```

提交查询复制

## 各国接口差异补充：

### 印度

印度

参数补充说明

👉 代收参数补充说明

| 参数名称 | 参数名 | 类型 | 可空 | 是否参与签名 | 说明 |
| --- | --- | --- | --- | --- | --- |
| 版本号 | version | string | 否 | 否 | 版本号，扩展参数extParams对象内字段：值为1.0; 是否传参咨询客服 |

扩展字段extParams结构：

```
{
"version": "1.0"
}
```

  
  

👉 代收回调参数补充说明

| 参数名称 | 参数名 | 类型 | 可空 | 是否参与签名 | 说明 |
| --- | --- | --- | --- | --- | --- |
| UTR值 | utr | string | 否 | 否 | 扩展参数version=1.0的商户，utr必填，且需要参与签名，签名规则为： ASCII码从小到大排序，最后加上密钥，MD5签名转大写 |

  
  

👉 代付参数补充说明

| 参数名称 | 参数名 | 类型 | 可空 | 是否参与签名 | 说明 |
| --- | --- | --- | --- | --- | --- |
| 银行卡持卡人IFSC码 | ifsc | string | 否 | 否 | 银行卡持卡人IFSC码，直接传参，不添加至extParams字段内 |
| 版本号 | version | string | 否 | 否 | 版本号，扩展参数extParams对象内字段：值为1.0; 是否传参咨询客服 |

扩展字段extParams结构：

```
{
"version": "1.0"
}
```

  
  

---

### 印尼

印尼

参数补充说明

👉 代收参数补充说明

| 参数名称 | 参数名 | 类型 | 可空 | 是否参与签名 | 说明 |
| --- | --- | --- | --- | --- | --- |
| 银行编码 | bankCode | string | 否 | 否 | 银行编码,扩展参数extParams对象内字段 |
| 付款人姓名 | payName | string | 否 | 否 | 付款人姓名 |
| 付款人邮箱 | email | string | 否 | 否 | 付款人邮箱,扩展参数extParams对象内字段 |
| 付款人电话 | phoneNum | string | 否 | 否 | 付款人电话,扩展参数extParams对象内字段 |

扩展字段extParams结构：

```
{
"email": "fffff@kk.com" ,
"bankCode": "IDR_KSEI" ,
"phoneNum": "55113311"
}
```

  
  
  
  

👉 代付参数补充说明

| 参数名称 | 参数名 | 类型 | 可空 | 是否参与签名 | 说明 |
| --- | --- | --- | --- | --- | --- |
| 银行编码 | bankCode | string | 否 | 否 | 参考银行编码说明 |
| 付款人邮箱 | email | string | 否 | 否 | 付款人邮箱,扩展参数extParams对象内字段 |
| 付款人电话 | phoneNum | string | 否 | 否 | 付款人电话,扩展参数extParams对象内字段 |

扩展字段extParams结构：

```
{
"email": "fffff@kk.co," ,
"phoneNum": "55113311"
}
```

  
  

---

👉 银行编码说明

如果编码表银行编码(bankCode)里有“钱包编码”，则之后为钱包编码

| 国家 | 银行编码(bankCode) | 银行名称(bankName) | 银行全称 |
| --- | --- | --- | --- |
| 印尼 | IDR\_BRI | BANK BRI |  |
| 印尼 | IDR\_MANDIRI | BANK MANDIRI |  |
| 印尼 | IDR\_BNI46 | BANK BNI 46 |  |
| 印尼 | IDR\_DANAMON | BANK DANAMON INDONESIA |  |
| 印尼 | IDR\_PERMATA | BANK PERMATA |  |
| 印尼 | IDR\_BCA | BANK BCA |  |
| 印尼 | IDR\_BII | BII Maybank |  |
| 印尼 | IDR\_Maybank | Bank Maybank Syariah Indonesia |  |
| 印尼 | IDR\_PANIN | BANK PANIN |  |
| 印尼 | IDR\_CIMB | BANK CIMB NIAGA |  |
| 印尼 | IDR\_UOB | BANK UOB BUANA INDONESIA |  |
| 印尼 | IDR\_OCBC | BANK OCBC NISP |  |
| 印尼 | IDR\_CITIBANK | CITIBANK |  |
| 印尼 | IDR\_CCB | BANK CCB INDONESIA |  |
| 印尼 | IDR\_ARTHA | BANK ARTHA GRAHA |  |
| 印尼 | IDR\_MUFG | MUFG BANK |  |
| 印尼 | IDR\_DBS | BANK DBS INDONESIA |  |
| 印尼 | IDR\_STANDARD | BANK STANDARD CHARTERED |  |
| 印尼 | IDR\_CAPITAL | BANK CAPITAL |  |
| 印尼 | IDR\_ANZ | BANK ANZ INDONESIA |  |
| 印尼 | IDR\_BOC | THE BANK OF CHINA |  |
| 印尼 | IDR\_BUMI | BANK BUMI ARTA |  |
| 印尼 | IDR\_HSBC | BANK HSBC |  |
| 印尼 | IDR\_JTRUST | BANK JTRUST INDONESIA |  |
| 印尼 | IDR\_MAYAPADA | BANK MAYAPADA INTERNATIONAL |  |
| 印尼 | IDR\_JABAR | BANK JABAR |  |
| 印尼 | IDR\_DKI | BPD DKI JAKARTA |  |
| 印尼 | IDR\_DIY | BPD DIY |  |
| 印尼 | IDR\_JATENG | BANK JATENG |  |
| 印尼 | IDR\_JATIM | Bank Jatim |  |
| 印尼 | IDR\_JAMBI | BPD JAMBI |  |
| 印尼 | IDR\_ACEH | BPD ACEH |  |
| 印尼 | IDR\_SUMUT | BANK SUMUT |  |
| 印尼 | IDR\_SUMUT\_UUS | Bank Sumut UUS |  |
| 印尼 | IDR\_SUMBAR | BPD SUMATERA BARAT |  |
| 印尼 | IDR\_RIAU | BPD RIAU |  |
| 印尼 | IDR\_SUMSEL | BPD SUMSEL BABEL |  |
| 印尼 | IDR\_LAMPUNG | BPD LAMPUNG |  |
| 印尼 | IDR\_KALSEL | BPD KALSEL |  |
| 印尼 | IDR\_KALBAR | BPD KALBAR |  |
| 印尼 | IDR\_KALTIMTARA | BPD KALTIMTARA |  |
| 印尼 | IDR\_KALTENG | BPD KALTENG |  |
| 印尼 | IDR\_SULSELBAR | BANK SULSELBAR |  |
| 印尼 | IDR\_SULUTGO | BANK SULUTGO |  |
| 印尼 | IDR\_NTB | BPD NUSA TENGGARA BARAT |  |
| 印尼 | IDR\_BALI | BPD BALI |  |
| 印尼 | IDR\_NTT | Bank NTT |  |
| 印尼 | IDR\_MALUKU | BPD MALUKU |  |
| 印尼 | IDR\_PAPUA | BPD PAPUA |  |
| 印尼 | IDR\_BENGKULU | BPD BENGKULU |  |
| 印尼 | IDR\_SULAWESI\_TENGAH | BPD SULAWESI TENGAH |  |
| 印尼 | IDR\_SULAWESI\_TENGGARA | BPD SULAWESI TENGGARA |  |
| 印尼 | IDR\_SULAWESI\_Utara | BPD Sulawesi Utara(SulutGo) |  |
| 印尼 | IDR\_BANTEN | BPD BANTEN |  |
| 印尼 | IDR\_INDIA | BANK OF INDIA INDONESIA |  |
| 印尼 | IDR\_MUAMALAT | BANK MUAMALAT INDONESIA |  |
| 印尼 | IDR\_MESTIKA | BANK MESTIKA DHARMA |  |
| 印尼 | IDR\_SHINHAN | BANK SHINHAN INDONESIA |  |
| 印尼 | IDR\_SINARMAS | BANK SINARMAS |  |
| 印尼 | IDR\_SINARMAS\_UUS | Bank Sinarmas UUS |  |
| 印尼 | IDR\_MASPION | BANK MASPION INDONESIA |  |
| 印尼 | IDR\_GANESHA | BANK GANESHA |  |
| 印尼 | IDR\_ICBC | BANK ICBC |  |
| 印尼 | IDR\_QNB | BANK QNB KESAWAN |  |
| 印尼 | IDR\_QNB\_IND | BANK QNB Indonesia |  |
| 印尼 | IDR\_BTN | Bank BTN |  |
| 印尼 | IDR\_WOORI | BANK WOORI SAUDARA |  |
| 印尼 | IDR\_Himpunan | Bank Himpunan Saudara 1906 |  |
| 印尼 | IDR\_BTPN | Bank BTPN |  |
| 印尼 | IDR\_VICTORIA\_SYARIAH | BANK VICTORIA SYARIAH |  |
| 印尼 | IDR\_JABAR\_SYARIAH | BANK JABAR BANTEN SYARIAH |  |
| 印尼 | IDR\_MEGA | BANK MEGA |  |
| 印尼 | IDR\_Bukopin | Wokee/Bukopin |  |
| 印尼 | IDR\_BKB | BANK KB BUKOPIN |  |
| 印尼 | IDR\_BSI | BANK BSI (BANK SYARIAH INDONESIA) |  |
| 印尼 | IDR\_JASA | BANK JASA JAKARTA |  |
| 印尼 | IDR\_KEB | BANK KEB HANA |  |
| 印尼 | IDR\_MNC | BANK MNC INTERNASIONAL |  |
| 印尼 | IDR\_NEO | BANK NEO COMMERCE |  |
| 印尼 | IDR\_RAYA | BANK RAYA INDONESIA |  |
| 印尼 | IDR\_SBI | BANK SBI INDONESIA |  |
| 印尼 | IDR\_DIGITAL\_BCA | BANK DIGITAL BCA |  |
| 印尼 | IDR\_Scotland | Royal Bank of Scotland (RBS) |  |
| 印尼 | IDR\_NATIONAL\_NOBU | BANK NATIONAL NOBU |  |
| 印尼 | IDR\_SYARIAH\_MEGA | BANK SYARIAH MEGA |  |
| 印尼 | IDR\_INA | BANK INA PERDANA |  |
| 印尼 | IDR\_PANIN\_DUBAI | BANK PANIN DUBAI SYARIAH |  |
| 印尼 | IDR\_PRIMA | BANK PRIMA MASTER |  |
| 印尼 | IDR\_BUKOPIN\_SYARIAH | BANK BUKOPIN SYARIAH |  |
| 印尼 | IDR\_SAHABAT | BANK SAHABAT SAMPOERNA |  |
| 印尼 | IDR\_OKE | BANK OKE INDONESIA |  |
| 印尼 | IDR\_SEABANK | BANK SEABANK INDONESIA |  |
| 印尼 | IDR\_BCA\_SYARIAH | BANK BCA SYARIAH |  |
| 印尼 | IDR\_JAGO | BANK JAGO |  |
| 印尼 | IDR\_BTPN\_SYARIAH | BANK BTPN SYARIAH |  |
| 印尼 | IDR\_BTPN | BTPN Syariah |  |
| 印尼 | IDR\_MULTI | BANK MULTI ARTA SENTOSA |  |
| 印尼 | IDR\_MAYORA | BANK MAYORA |  |
| 印尼 | IDR\_INDEX | BANK INDEX SELINDO |  |
| 印尼 | IDR\_MANDIRI\_TASPEN | BANK MANDIRI TASPEN POS |  |
| 印尼 | IDR\_VICTORIA | BANK VICTORIA INTERNASIONAL |  |
| 印尼 | IDR\_ALLO | BANK ALLO |  |
| 印尼 | IDR\_IBK | BANK IBK INDONESIA |  |
| 印尼 | IDR\_ALADIN | BANK ALADIN SYARIAH |  |
| 印尼 | IDR\_CTBC | BANK CTBC INDONESIA |  |
| 印尼 | IDR\_COMMONWEALTH | BANK COMMONWEALTH |  |
| 印尼 | IDR\_ANDARA | Bank Andara |  |
| 印尼 | IDR\_ANGLIMAS | Anglomas International Bank |  |
| 印尼 | IDR\_ANTAR\_DAERAH | BANK ANTAR DAERAH |  |
| 印尼 | IDR\_ARTA\_NIAGA | Bank Arta Niaga Kencana |  |
| 印尼 | IDR\_BISNIS | Bank Bisnis Internasional |  |
| 印尼 | IDR\_BANGKOK | Bangkok Bank |  |
| 印尼 | IDR\_AKITA | Bank akita |  |
| 印尼 | IDR\_BNI\_SYARIAH | Bank BNI Syariah |  |
| 印尼 | IDR\_AMERICA | BANK OF AMERICA NA |  |
| 印尼 | IDR\_BPR\_KS | BPR KS |  |
| 印尼 | IDR\_Negara | Bank Negara Indonesia(BNI) |  |
| 印尼 | IDR\_BTN | Bank Tabungan Negara (BTN) |  |
| 印尼 | IDR\_BTN\_UUS | Bank Tabungan Negara (BTN) UUS |  |
| 印尼 | IDR\_CNB | Centratama Nasional Bank(CNB) |  |
| 印尼 | IDR\_CTT | Bank Centratama |  |
| 印尼 | IDR\_CIMB\_UUS | Bank CIMB Niaga UUS |  |
| 印尼 | IDR\_PEMBANGUNAN\_DAERAH\_DY | BANK PEMBANGUNAN DAERAH DIY UNIT USAHA SYARIAH |  |
| 印尼 | IDR\_DANAMON\_UUS | Bank Danamon UUS |  |
| 印尼 | IDR\_DEUTSCHE | Deutsche Bank |  |
| 印尼 | IDR\_DKI | Bank DKI |  |
| 印尼 | IDR\_DKI\_UUS | Bank DKI UUS |  |
| 印尼 | IDR\_EKA | Bank EKA |  |
| 印尼 | IDR\_FAMA | Bank Fama International |  |
| 印尼 | IDR\_MANTAP | Bank MANTAP |  |
| 印尼 | IDR\_JAWA\_TENGAH\_SYARIAH | BPD JAWA TENGAH UNIT USAHA SYARIAH |  |
| 印尼 | IDR\_JAWA\_TIMUR | BPD Jawa Timur |  |
| 印尼 | IDR\_JPMORGAN | JPMORGAN CHASE BANK |  |
| 印尼 | IDR\_KALBAR\_UUS | BPD Kalimantan Barat UUS |  |
| 印尼 | IDR\_KALSEL | BPD Kalimantan Selatan/Kalsel |  |
| 印尼 | IDR\_KALSEL\_UUS | BPD Kalimantan Selatan UUS |  |
| 印尼 | IDR\_KALTIM | BPD Kalimantan Timur |  |
| 印尼 | IDR\_KALTIM\_UUS | BPD Kalimantan Timur UUS |  |
| 印尼 | IDR\_KALTEN | BPD Kalimantan Tengah (Kalteng) |  |
| 印尼 | IDR\_METRO | BANK METRO EXPRESS |  |
| 印尼 | IDR\_MITRA | Bank Mitra Niaga |  |
| 印尼 | IDR\_MIZUHO | Bank Mizuho Indonesia |  |
| 印尼 | IDR\_MUTIARA | Bank MUTIARA |  |
| 印尼 | IDR\_NTB | BPD Nusa Tenggara Barat (NTB) |  |
| 印尼 | IDR\_NTB\_UUS | BPD Nusa Tenggara Barat (NTB) UUS |  |
| 印尼 | IDR\_NUSANTARA | Bank Nusantara Parahyangan |  |
| 印尼 | IDR\_OCBC\_UUS | Bank OCBC NISP UUS |  |
| 印尼 | IDR\_PERMATA\_UUS | Bank Permata UUS |  |
| 印尼 | IDR\_Central\_Asia | Bank Central Asia(BCA) |  |
| 印尼 | IDR\_PUNDI | BANK PUNDI INDONESIA |  |
| 印尼 | IDR\_RABO | Rabobank International Indonesia |  |
| 印尼 | IDR\_RESONA | Bank Resona Perdania |  |
| 印尼 | IDR\_RIAU\_KEPRI\_UUS | BPD Riau Dan Kepri UUS |  |
| 印尼 | IDR\_SULSELBAR\_UUS | Bank Sulselbar UUS |  |
| 印尼 | IDR\_SUMBAR\_UUS | BPD Sumatera Barat UUS |  |
| 印尼 | IDR\_NAGARI | BANK NAGARI |  |
| 印尼 | IDR\_SUMSEL\_BABEL\_UUS | Bank Sumsel Dan Babel UUS |  |
| 印尼 | IDR\_SUMUT\_UUS | Bank Sumut UUS |  |
| 印尼 | IDR\_SUMITOMO | Bank Sumitomo Mitsui Indonesia |  |
| 印尼 | IDR\_BNP\_PARIBAS | BANK BNP PARIBAS INDONESIA |  |
| 印尼 | IDR\_SUPRA | BPR SUPRA ARTAPERSADA |  |
| 印尼 | IDR\_SYARIAH\_MANDIRI | Bank Syariah Mandiri |  |
| 印尼 | IDR\_BJB | Bank BJB |  |
| 印尼 | IDR\_ROYAL | Bank Royal Indonesia |  |
| 印尼 | IDR\_TPN | Bank Tabungan Pensiunan Nasional |  |
| 印尼 | IDR\_KALTIM | BPD Kalimantan Timur |  |
| 印尼 | IDR\_RIAU\_KEPRI | BPD Riau Dan Kepri |  |
| 印尼 | IDR\_HARDA | Bank Harda Internasional |  |
| 印尼 | IDR\_KALBAR | BPD Kalimantan Barat |  |
| 印尼 | IDR\_HSBC\_UUS | Hongkong and Shanghai Bank Corporation (HSBC) UUS |  |
| 印尼 | IDR\_TOKYO\_MITSUBISHI | Bank of Tokyo Mitsubishi UFJ |  |
| 印尼 | IDR\_TOKYO | Bank of Tokyo |  |
| 印尼 | IDR\_DINAR | Bank Dinar Indonesia |  |
| 印尼 | IDR\_BRI\_SYARIAH | Bank BRI Syariah |  |
| 印尼 | IDR\_BJB\_SYARIAH | Bank BJB Syariah |  |
| 印尼 | IDR\_AGRONIAGA | Bank BRI Agroniaga |  |
| 印尼 | IDR\_BRI\_AGRONIAGA | Bank BRI Agroniaga |  |
| 印尼 | IDR\_VA\_MANDIRI | Virtual Account Bank Mandiri |  |
| 印尼 | IDR\_VA\_BRI | Virtual Account Bank BRI |  |
| 印尼 | IDR\_VA\_CIMB | Virtual Account Bank CIMB |  |
| 印尼 | IDR\_VA\_PERMATA | Virtual Account Bank Permata |  |
| 印尼 | IDR\_VA\_BCA | Virtual Account Bank BCA |  |
| 印尼 | IDR\_VA\_BNI | Virtual Account Bank BNI |  |
| 印尼 | IDR\_OVO | OVO |  |
| 印尼 | IDR\_DANA | DANA |  |
| 印尼 | IDR\_GOPAY | GOPAY |  |
| 印尼 | IDR\_SHOPEEPAY | SHOPEEPAY |  |
| 印尼 | IDR\_LINKAJA | LINKAJA |  |
| 印尼 | IDR\_MULTICOR | Bank MULTICOR |  |
| 印尼 | IDR\_DIY | BPD\_Daerah\_Istimewa\_Yogyakarta\_(DIY) |  |
| 印尼 | IDR\_Agris\_UUS | Bank Agris UUS |  |
| 印尼 | IDR\_NTT | BPD Nusa Tenggara Timur(NTT) |  |
| 印尼 | IDR\_Sulteng | Bank Sulteng |  |
| 印尼 | IDR\_Sultra | Bank Sultra |  |
| 印尼 | IDR\_Rakyat | Bank Rakyat Indonesia |  |
| 印尼 | IDR\_Artha\_Graha | Bank Artha Graha |  |
| 印尼 | IDR\_KASPRO | KASPRO |  |
| 印尼 | IDR\_GOPAYDRIVER | GOPAYDRIVER |  |
| 印尼 | IDR\_LIPPO | LIPPO |  |
| 印尼 | IDR\_BAIND | BANK ARTOS IND |  |
| 印尼 | IDR\_YUDHA | BANK YUDHA BHAKTI |  |
| 印尼 | IDR\_BAA | Bank ABN Amro |  |
| 印尼 | IDR\_Agris | Bank Agris |  |
| 印尼 | IDR\_Antard | Bank Antardaerah |  |
| 印尼 | IDR\_Bintang | Bank Bintang Manunggal |  |
| 印尼 | IDR\_BCAI | Bank Credit Agricole Indosuez |  |
| 印尼 | IDR\_BBCL | The Bangkok Bank Comp. LTD |  |
| 印尼 | IDR\_KEBD | Korea Exchange Bank Danamon |  |
| 印尼 | IDR\_Ekonomi | Bank Ekonomi |  |
| 印尼 | IDR\_Haga | Bank Haga |  |
| 印尼 | IDR\_Hagakita | Bank Hagakita |  |
| 印尼 | IDR\_Harfa | Bank Harfa |  |
| 印尼 | IDR\_Harmoni | Bank Harmoni International |  |
| 印尼 | IDR\_IFI | Bank IFI |  |
| 印尼 | IDR\_ING | ING Indonesia Bank |  |
| 印尼 | IDR\_BKTB | Bank Keppel Tatlee Buana |  |
| 印尼 | IDR\_LIB | Liman International Bank |  |
| 印尼 | IDR\_Merincorp | Bank Merincorp |  |
| 印尼 | IDR\_BPI | Bank Persyarikatan Indonesia |  |
| 印尼 | IDR\_BSP | Bank Sri Partha |  |
| 印尼 | IDR\_Swaguna | Bank Swaguna |  |
| 印尼 | IDR\_BNC | Bank BNC |  |
| 印尼 | IDR\_BPD | Bank Purba Danarta |  |
| 印尼 | IDR\_BWK | Bank Windu Kentjana |  |
| 印尼 | IDR\_INDO | Indosat Dompetku |  |
| 印尼 | IDR\_BEIND | Bank Ekspor Indonesia |  |
| 印尼 | IDR\_JENIUS | JENIUS |  |
| 印尼 | IDR\_Barat | Bank Kalimantan Barat |  |
| 印尼 | IDR\_ANZPA | ANZ PANIN BANK |  |
| 印尼 | IDR\_SWADESI | BANK SWADESI |  |
| 印尼 | IDR\_MITRANIAGA | BANK MITRANIAGA |  |
| 印尼 | IDR\_KESEJAHTERAAN | BANK KESEJAHTERAAN EKONOMI |  |
| 印尼 | IDR\_VICTORIA | BANK VICTORIA INTERNATIONALI |  |
| 印尼 | IDR\_EKSEKUTIF | BANK EKSEKUTIF |  |
| 印尼 | IDR\_BSHB | PT. BANK SINAR HARAPAN BALI |  |
| 印尼 | IDR\_FINCONESIA | BANK FINCONESIA |  |
| 印尼 | IDR\_BCTI | BANK CHINA TRUST INDONESIA |  |
| 印尼 | IDR\_JABAR | BANK JABAR BANTEN |  |
| 印尼 | IDR\_PERMATASY | BANK PERMATA SYARIAH |  |
| 印尼 | IDR\_JAMBISY | BANK JAMBI SYARIAH |  |
| 印尼 | IDR\_ACEHSY | BANK ACEH SYARIAH |  |
| 印尼 | IDR\_PEMBANGUNAN\_DB | BANK PEMBANGUNAN DAERAH BALI |  |
| 印尼 | IDR\_PEMBANGUNAN\_DK | BANK PEMBANGUNAN DAERAH KALSEL |  |
| 印尼 | IDR\_PEMBANGUNAN\_DSB | BANK PEMBANGUNAN DAERAH SUMATERA BARAT |  |
| 印尼 | IDR\_PTBSHB | PT. BANK SINAR HARAPAN BALI |  |
| 印尼 | IDR\_SUMATERAUT | PT.BPD SUMATERA UTARA UUS |  |
| 印尼 | IDR\_SUMATERAUT\_UUS | PT.BPD SUMATERA UTARA UUS |  |
| 印尼 | IDR\_BNTT | BPD NUSA TENGGARA TIMUR |  |
| 印尼 | IDR\_BJTUUS | PT. BANK JAGO TBK UUS |  |
| 印尼 | IDR\_PEMBANGUNAN\_DAERAH | Bank Pembangunan Daerah (BPD DIY) |  |
| 印尼 | IDR\_JAWATUUS | PT. BPD JAWA TENGAH UUS |  |
| 印尼 | IDR\_JAWA\_TIMURUUS | PT. BPD JAWA TIMUR UUS |  |
| 印尼 | IDR\_KSEI | PT. KSEI |  |
| 印尼 | IDR\_AIRPAY | PT AIRPAY INTERNATIONAL |  |
| 印尼 | IDR\_EDIND\_KOE | PT. ESPAY DEBIT INDONESIA KOE |  |
| 印尼 | IDR\_BANIND | PT BANK AMAR INDONESIA |  |
| 印尼 | IDR\_CHCON | PT. BANK CHINA CONSTRUCTION |  |
| 印尼 | IDR\_SULUT | PT. BPD SULUT GORONTALO |  |
| 印尼 | IDR\_JAMBI\_UUS | PT. BPD JAMBI UUS |  |
| 印尼 | IDR\_BANKIND | BANK INDONESIA ID |  |
| 印尼 | IDR\_MAYBANKIND | Bank Maybank Indocorp |  |
| 印尼 | IDR\_SUMSEL\_SYARIAH | BANK BPD SUMATERA SELATAN SYARIAH |  |
| 印尼 | IDR\_DIY\_SYARIAH | BANK BPD YOGYAKARTA SYARIAH |  |
| 印尼 | IDR\_JATIM\_SYARIAH | BANK JATIM SYARIAH |  |
| 印尼 | IDR\_JATENG\_UUS | BANK BPD JATENG UUS |  |
| 印尼 | ANDB | Andhra Bank |  |
| 印尼 | BARB | Bank of Baroda |  |
| 印尼 | BDBL | Bandhan Bank |  |
| 印尼 | CBIN | Central Bank of India |  |
| 印尼 | CNRB | Canara Bank |  |
| 印尼 | DCBL | DCB Bank |  |
| 印尼 | FDRL | Federal Bank |  |
| 印尼 | HDFC | HDFC Bank |  |
| 印尼 | ICIC | ICICI Bank |  |
| 印尼 | IDFB | IDFC First Bank |  |
| 印尼 | IDIB | Indian Bank |  |
| 印尼 | IOBA | Indian Overseas Bank |  |
| 印尼 | KARB | Karnataka Bank |  |
| 印尼 | KKBK | Kotak Mahindra Bank |  |
| 印尼 | KVBL | Karur Vysya Bank |  |
| 印尼 | PMCB | Punjab National Bank |  |
| 印尼 | SBIN | State Bank of India |  |
| 印尼 | SCBL | Standard Chartered Bank |  |
| 印尼 | SIBL | South Indian Bank |  |
| 印尼 | SYNB | Syndicate Bank |  |
| 印尼 | UBIN | Union Bank of India |  |
| 印尼 | UCBA | UCO Bank |  |
| 印尼 | UTIB | Axis Bank |  |
| 印尼 | YESB | Yes Bank |  |

### 巴基斯坦

巴基斯坦

参数补充说明

👉 代收参数补充说明

| 参数名称 | 参数名 | 类型 | 可空 | 是否参与签名 | 说明 |
| --- | --- | --- | --- | --- | --- |
| 通道编码 | channelCode | string | 否 | 否 | 扩展参数extParams对象内字段，jz或者ep二选一. 1、如果不传extParams或者为空，或者为无效参数，返回的cashierUrl值是平台收银台地址用户可手工选择jz或ep. 2、如果传了extParams并且 channelCode参数有效返回的cashierUrl值是平台收银台地址。如果channelCode等于ep收银台只显示ep。如果channelCode等于jz收银台只显示jz |

扩展字段extParams结构：

```
{
"channelCode": "jz"
}
```

  
  
  
  

👉 代付参数补充说明

| 参数名称 | 参数名 | 类型 | 可空 | 是否参与签名 | 说明 |
| --- | --- | --- | --- | --- | --- |
| 通道编码 | channelCode | string | 否 | 否 | 扩展参数extParams对象内字段，jz或者ep二选一. 1、如果不传extParams或者为空，或者为无效参数，返回的cashierUrl值是平台收银台地址用户可手工选择jz或ep. 2、如果传了extParams并且 channelCode参数有效返回的cashierUrl值是平台收银台地址。如果channelCode等于ep收银台只显示ep。如果channelCode等于jz收银台只显示jz |
| 手机号码 | phoneNum | string | 否 | 否 | 扩展参数extParams对象内字段 真实有效的用户手机号码 当扩展参数中的channelCode和phoneNum有值时，bankCode银行代码，accName收款人姓名，accNo出款账号，bankName银行名称,可留空。 |
| 身份证号 | identityNo | string | 否 | 否 | 扩展参数extParams对象内字段 String类型 值：身份证号 |

扩展字段extParams结构：

```
{
"channelCode": "jz" ,
"phoneNum": "11111" ,
"identityNo": "5511222"
}
```

  
  

---

👉 银行编码说明

如果编码表银行编码(bankCode)里有“钱包编码”，则之后为钱包编码

| 国家 | 银行编码(bankCode) | 银行名称(bankName) | 银行全称 |
| --- | --- | --- | --- |
| 巴基斯坦 | ADVANS\_PAKISTAN\_MICRO\_FINANCE\_BANK | ADVANS PAKISTAN MICRO FINANCE BANK |  |
| 巴基斯坦 | ALBARAKA\_ISLAMIC\_BANK | ALBARAKA ISLAMIC BANK |  |
| 巴基斯坦 | ALLIED\_BANK\_LIMITED | ALLIED BANK LIMITED |  |
| 巴基斯坦 | APNA\_MICRO\_FINANCE\_BANK | APNA MICRO FINANCE BANK |  |
| 巴基斯坦 | ASKARI\_BANK\_LIMITED | ASKARI BANK LIMITED |  |
| 巴基斯坦 | BANK\_AL\_HABIB\_LIMITED | BANK AL HABIB LIMITED |  |
| 巴基斯坦 | BANK\_ALFALAH\_LIMITED | BANK ALFALAH LIMITED |  |
| 巴基斯坦 | BANK\_ISLAMI\_PAKISTAN\_LIMITED | BANK ISLAMI PAKISTAN LIMITED |  |
| 巴基斯坦 | BANK\_OF\_KHYBER | BANK OF KHYBER |  |
| 巴基斯坦 | CITI\_BANK\_NA | CITI BANK NA |  |
| 巴基斯坦 | DUBAI\_ISLAMIC\_BANK\_PAKISTAN\_LIMITED | DUBAI ISLAMIC BANK PAKISTAN LIMITED |  |
| 巴基斯坦 | FAYSAL\_BANK\_LIMITED | FAYSAL BANK LIMITED |  |
| 巴基斯坦 | FINCA\_MICRO\_FINANCE\_BANK | FINCA MICRO FINANCE BANK |  |
| 巴基斯坦 | FIRST\_WOMEN\_BANK\_LIMITED | FIRST WOMEN BANK LIMITED |  |
| 巴基斯坦 | HABIB\_BANK\_LIMITED | HABIB BANK LIMITED |  |
| 巴基斯坦 | HABIB\_METROPOLITAN\_BANK\_LIMITED | HABIB METROPOLITAN BANK LIMITED |  |
| 巴基斯坦 | HBL\_MICRO\_FINANCE\_BANK | HBL MICRO FINANCE BANK |  |
| 巴基斯坦 | INDUSTRIAL\_AND\_COMMERCIAL\_BANK\_OF\_CHINA\_LIMITED | INDUSTRIAL AND COMMERCIAL BANK OF CHINA LIMITED |  |
| 巴基斯坦 | JS\_BANK\_LIMITED | JS BANK LIMITED |  |
| 巴基斯坦 | KHUSHHALI\_MICRO\_FINANCE\_BANK | KHUSHHALI MICRO FINANCE BANK |  |
| 巴基斯坦 | MCB\_ARIF\_HABIB | MCB ARIF HABIB |  |
| 巴基斯坦 | MCB\_BANK\_LIMITED | MCB BANK LIMITED |  |
| 巴基斯坦 | MCB\_ISLAMIC | MCB ISLAMIC |  |
| 巴基斯坦 | MEEZAN\_BANK | MEEZAN BANK |  |
| 巴基斯坦 | NATIONAL\_BANK\_OF\_PAKISTAN | NATIONAL BANK OF PAKISTAN |  |
| 巴基斯坦 | NBP\_FUNDS | NBP FUNDS |  |
| 巴基斯坦 | NRSP\_MICRO\_FINANCE\_BANK | NRSP MICRO FINANCE BANK |  |
| 巴基斯坦 | SAMBA\_BANK\_LIMITED | SAMBA BANK LIMITED |  |
| 巴基斯坦 | SILK\_BANK\_LIMITED | SILK BANK LIMITED |  |
| 巴基斯坦 | SINDH\_BANK\_LIMITED | SINDH BANK LIMITED |  |
| 巴基斯坦 | SONERI\_BANK\_LIMITED | SONERI BANK LIMITED |  |
| 巴基斯坦 | STANDARD\_CHARTERED\_BANK\_LTD | STANDARD CHARTERED BANK LTD |  |
| 巴基斯坦 | SUMMIT\_BANK\_LIMITED | SUMMIT BANK LIMITED |  |
| 巴基斯坦 | TELENOR\_MICRO\_FINANCE\_BANK | TELENOR MICRO FINANCE BANK |  |
| 巴基斯坦 | THE\_BANK\_OF\_PUNJAB | THE BANK OF PUNJAB |  |
| 巴基斯坦 | U\_MICRO\_FINANCE\_BANK | U MICRO FINANCE BANK |  |
| 巴基斯坦 | UNITED\_BANK\_LIMITED | UNITED BANK LIMITED |  |
| 巴基斯坦 | NAYAPAY | NAYAPAY |  |
| 巴基斯坦 | FINJA | FINJA |  |
| 巴基斯坦 | UPAISA | UPAISA |  |
| 巴基斯坦 | KONNECT | KONNECT |  |
| 巴基斯坦 | SADAPAY | SADAPAY |  |
| 巴基斯坦 | KEENU | Keenu |  |
| 巴基斯坦 | ZONG | PayMax(Zong) |  |
| 巴基斯坦 | BYKEA | BYKEA |  |
| 巴基斯坦 | TAG | TAG |  |
| 巴基斯坦 | WASEELAMICR | WASEELAMICR OF INANCE BANK LTD. |  |
| 巴基斯坦 | KASB | KASB BANK LTD. |  |
| 巴基斯坦 | ZARAI\_TARAQIATI | ZARAI\_TARAQIATI\_BANK |  |
| 巴基斯坦 | NIB | NIB BANK LTD. |  |
| 巴基斯坦 | MOBILINK\_MICROFINANCE\_BANK\_LIMITED | Mobilink Microfinance Bank Limited |  |
| 巴基斯坦 | SME\_BANK\_LIMITED | SME Bank Limited |  |
| 巴基斯坦 | WHITE\_LABEL\_ATM | WHITE LABEL ATM |  |
| 巴基斯坦 | CDNS | Central Directorate of National Savings (CDNS) |  |
| 巴基斯坦 | SIMPAISA | SimPaisa |  |
| 巴基斯坦 | ABHI\_FINANCE | Abhi Finance |  |
| 巴基斯坦 | BARWAQT | Barwaqt |  |
| 巴基斯坦 | OPAY | OPay |  |
| 巴基斯坦 | BANK\_ADVANS\_MICROFINANCE | Advans Pakistan Microfinance Bank Limited |  |
| 巴基斯坦 | BANK\_APNA\_MICROFINANCE | Apna Microfinance Bank Limited |  |
| 巴基斯坦 | BANK\_U\_MICROFINANCE | U Microfinance Bank Limited |  |
| 巴基斯坦 | 钱包编码 | 钱包名称 |  |
| 巴基斯坦 | JAZZCASH | JAZZCASH |  |
| 巴基斯坦 | EASYPAISA | EASYPAISA |  |

### 哥伦比亚

哥伦比亚

参数补充说明

👉 代收参数补充说明

| 参数名称 | 参数名 | 类型 | 可空 | 是否参与签名 | 说明 |
| --- | --- | --- | --- | --- | --- |
| 扩展字段 | extParams | string | 否 | 否 | 扩展字段JSON格式 |

扩展字段extParams结构：

```
{
"firstname": "Tomas" ,
"lastname": "Lee" ,
"beneficiaryType": "CC" ,
"beneficiaryId": "1037592319" ,
"ipAddress": "127.0.0.1" ,
"productUrl": "https://www.baidu.com" ,
"bankCode": "001" ,
"phone": "+573991111111" ,
"email": "tomas.lee@gmail.com"
}
```

firstname : 客户名   
lastname : 客户姓   
beneficiaryType : 用户身份类型   
beneficiaryId : 用户身份id   
ipAddress : 用户的设备ip   
productUrl : 产品地址   
bankCode : 银行编码(当支付类型为银行卡时必填)   
phone : 客户手机号   
email : 客户邮箱   
以上信息需替换成客户的真实信息

  
  
  
  

👉 代付参数补充说明

| 参数名称 | 参数名 | 类型 | 可空 | 是否参与签名 | 说明 |
| --- | --- | --- | --- | --- | --- |
| 银行编码 | bankCode | string | 否 | 否 | 参考银行编码说明 |
| 扩展字段 | extParams | string | 否 | 否 | JSON字段 |

扩展字段extParams结构：

```
{
"docType": "CC" ,
"docNumber": "1037596791" ,
"beneficiaryAccountType": "SAVINGS"
}
```

docType : 身份类型(CC;CE;TI;COLOMBIA\_PASSPORT\_ID;NIT)   
docNumber : 身份ID   
beneficiaryAccountType : 收款人账号类型(CHECKING;SAVINGS)   
以上信息需替换成客户的真实信息

  
  

---

👉 银行编码说明

如果编码表银行编码(bankCode)里有“钱包编码”，则之后为钱包编码

| 国家 | 银行编码(bankCode) | 银行名称(bankName) | 银行全称 |
| --- | --- | --- | --- |
| 哥伦比亚 | 001 | BANCO DE BOGOTA |  |
| 哥伦比亚 | 002 | BANCO POPULAR |  |
| 哥伦比亚 | 006 | ITAU |  |
| 哥伦比亚 | 007 | BANCOLOMBIA |  |
| 哥伦比亚 | 009 | CITIBANK |  |
| 哥伦比亚 | 012 | BANCO\_GNB\_SUDAMERIS |  |
| 哥伦比亚 | 013 | BBVA |  |
| 哥伦比亚 | 019 | SCOTIABANK COLPATRIA |  |
| 哥伦比亚 | 023 | BANCO DE OCCIDENTE |  |
| 哥伦比亚 | 031 | BANCOLDEX |  |
| 哥伦比亚 | 032 | BANCO CAJA SOCIAL |  |
| 哥伦比亚 | 040 | BANCO AGRARIO |  |
| 哥伦比亚 | 047 | BANCO MUNDO MUJER |  |
| 哥伦比亚 | 051 | DAVIVIENDA |  |
| 哥伦比亚 | 052 | AV VILLAS |  |
| 哥伦比亚 | 009 | CITIBANK |  |
| 哥伦比亚 | 012 | BANCO\_GNB\_SUDAMERIS |  |
| 哥伦比亚 | 013 | BBVA |  |
| 哥伦比亚 | 019 | SCOTIABANK COLPATRIA |  |
| 哥伦比亚 | 023 | BANCO DE OCCIDENTE |  |
| 哥伦比亚 | 031 | BANCOLDEX |  |
| 哥伦比亚 | 032 | BANCO CAJA SOCIAL |  |
| 哥伦比亚 | 040 | BANCO AGRARIO |  |
| 哥伦比亚 | 047 | BANCO MUNDO MUJER |  |
| 哥伦比亚 | 051 | DAVIVIENDA |  |
| 哥伦比亚 | 052 | AV VILLAS |  |
| 哥伦比亚 | 053 | BANCO W |  |
| 哥伦比亚 | 059 | BANCAMIA |  |
| 哥伦比亚 | 060 | PICHINCHA |  |
| 哥伦比亚 | 061 | BANCOOMEVA |  |
| 哥伦比亚 | 062 | BANCO FALABELLA |  |
| 哥伦比亚 | 063 | BANCO FINANDINA |  |
| 哥伦比亚 | 064 | BANCO MULTIBANK |  |
| 哥伦比亚 | 065 | BANCO SANTANDER DE NEGOCIOS |  |
| 哥伦比亚 | 066 | BANCO COOPERATIVO COOPCENTRAL |  |
| 哥伦比亚 | 069 | BANCO SERFINANZA |  |
| 哥伦比亚 | 121 | JURISCOOP |  |
| 哥伦比亚 | 289 | COOTRAFA |  |
| 哥伦比亚 | 298 | CONFIAR |  |
| 哥伦比亚 | 370 | COLTEFINANCIERA |  |
| 哥伦比亚 | 507 | NEQUI |  |
| 哥伦比亚 | 551 | DAVIPLATA |  |

### 马来西亚

马来西亚

参数补充说明

👉 代收参数补充说明

| 参数名称 | 参数名 | 类型 | 可空 | 是否参与签名 | 说明 |
| --- | --- | --- | --- | --- | --- |
| 付款人姓名 | payName | string | 否 | 否 | 付款人姓名 |
| 银行编码 | bankCode | string | 否 | 否 | 扩展参数extParams对象内字段，银行编码 |
| 付款人邮箱 | email | string | 否 | 否 | 扩展参数extParams对象内字段 |
| 付款人电话 | phoneNum | string | 否 | 否 | 扩展参数extParams对象内字段，付款人电话 |

扩展字段extParams结构：

```
{
"bankCode": "HLB" ,
"email": "11111@11.com" ,
"phoneNum": "11111"
}
```

  
  
  
  

👉 代付参数补充说明

| 参数名称 | 参数名 | 类型 | 可空 | 是否参与签名 | 说明 |
| --- | --- | --- | --- | --- | --- |
| 银行编码 | bankCode | string | 否 | 否 | 参考马来西亚银行编码表 |
| 身份类型 | beneficiaryType | string | 否 | 否 | 身份类型(Cedula:1;PAS:2;RUC:3),扩展参数extParams对象内字段 |
| 身份ID | beneficiaryId | string | 否 | 否 | 身份ID,扩展参数extParams对象内字段 |
| 收款人账号类型 | beneficiaryAccountType | string | 否 | 否 | (CHECKING:1;SAVINGS:2),扩展参数extParams对象内字段 |
| 付款人邮箱 | email | string | 否 | 否 | 扩展参数extParams对象内字段 |
| 付款人电话 | phoneNum | string | 否 | 否 | 扩展参数extParams对象内字段 |

扩展字段extParams结构：

```
{
"beneficiaryType": "1" ,
"beneficiaryId": "11111222" ,
"beneficiaryAccountType": "2" ,
"email": "11111@11.com" ,
"phoneNum": "11111"
}
```

  
  

---

👉 银行编码说明

如果编码表银行编码(bankCode)里有“钱包编码”，则之后为钱包编码

| 国家 | 银行编码(bankCode) | 银行名称(bankName) | 银行全称 |
| --- | --- | --- | --- |
| 马来西亚 | MAY | Maybank |  |
| 马来西亚 | MAYBANKISLAMIC | MAYBANK ISLAMIC BERHAD |  |
| 马来西亚 | MCIMB | CIMB Bank |  |
| 马来西亚 | CIMBISLAMIC | CIMB ISLAMIC BANK BERHAD |  |
| 马来西亚 | PBE | Public Bank Berhad |  |
| 马来西亚 | PUBLICISLAMIC | PUBLIC ISLAMIC BANK BERHAD |  |
| 马来西亚 | RHB | RHB Bank |  |
| 马来西亚 | HLB | Hong Leong Bank |  |
| 马来西亚 | HLISLAMIC | HONG LEONG ISLAMIC BANK BERHAD |  |
| 马来西亚 | AM | AmBank |  |
| 马来西亚 | ALLIANCE | Alliance Bank Malaysia Berhad |  |
| 马来西亚 | ALLIANCEISLAMIC | ALLIANCE ISLAMIC BANK (M) BERHAD |  |
| 马来西亚 | AFFIN | Affin Bank |  |
| 马来西亚 | AFIN | Affin Islamic Bank |  |
| 马来西亚 | MHSBC | HSBC |  |
| 马来西亚 | HSBCAMANAH | HSBCAMANAH |  |
| 马来西亚 | BIMB | Bank Islam Malaysia |  |
| 马来西亚 | MOCBC | OCBC |  |
| 马来西亚 | OCBCALAMIN | OCBC AL-AMIN BANK BERHAD |  |
| 马来西亚 | MUOB | UOB |  |
| 马来西亚 | AGRO | BANK PERTANIAN |  |
| 马来西亚 | BKRM | Bank Rakyat |  |
| 马来西亚 | BMMB | Bank Muamalat |  |
| 马来西亚 | BSN | BSN |  |
| 马来西亚 | RAJHI | AL-RAJHI Bank |  |
| 马来西亚 | BKK | BANGKOK Bank |  |
| 马来西亚 | BI | ISLAM Bank |  |
| 马来西亚 | RAKYAT | KERJASAMA RAKYAT MALAYSIA Bank |  |
| 马来西亚 | MBOA | Bank Of America |  |
| 马来西亚 | MBOC | Bank Of China |  |
| 马来西亚 | BIGPAY | BIGPAY Bank |  |
| 马来西亚 | MBNP | BNP PARIBAS MALAYSIA Bank |  |
| 马来西亚 | MCCB | CHINA CONSTRUCTION (CCB) Bank |  |
| 马来西亚 | FINEXUS | FINEXUS CARDS Bank |  |
| 马来西亚 | ICBC | INDUSTRIAL AND COMMERCIAL OF CHINA (ICBC) Bank |  |
| 马来西亚 | MJPMORGAN | J.P. MORGAN CHASE Bank |  |
| 马来西亚 | KFH | KUWAIT FINANCE HOUSE Bank |  |
| 马来西亚 | MBSB | MBSB Bank |  |
| 马来西亚 | MCB | MIZUHO CORPORATE Bank |  |
| 马来西亚 | MUFGB | MUFG Bank |  |
| 马来西亚 | MSCB | STANDARD CHARTERED Bank |  |
| 马来西亚 | SUMITOMO | SUMITOMO MITSUI CORPORATION Bank |  |
| 马来西亚 | TNG | TOUCH N GO EWALLET Bank |  |
| 马来西亚 | MCITI | CITI Bank |  |
| 马来西亚 | GX | GXbank |  |
| 马来西亚 | BAKO | Bangkok Bank Malaysia |  |
| 马来西亚 | CITI | CITIBANK BERHAD |  |
| 马来西亚 | CITISPI | CITIBANK - SPI |  |
| 马来西亚 | DEUT | DEUTSCHE BANK |  |
| 马来西亚 | DBBSPI | Deutsche Bank (Malaysia) Berhad - SPI |  |
| 马来西亚 | MYIS | Islam Bank |  |
| 马来西亚 | OCBC | OCBC Bank |  |
| 马来西亚 | RAJH | AL-RAJHI BANK |  |
| 马来西亚 | RAKY | RAKYAT BANK |  |
| 马来西亚 | SINA | BANK SIMPANAN NASIONAL |  |
| 马来西亚 | BSNBSN | BANK SIMPANAN NASIONAL - SPI |  |
| 马来西亚 | UNOB | UNITED OVERSEAS BANK |  |
| 马来西亚 | AEON | AEON BANK |  |
| 马来西亚 | AMISLAMIC | AMISLAMIC BANK BERHAD |  |
| 马来西亚 | BOOST | Boost Bank |  |
| 马来西亚 | BOSTMYNB | Boost eWallet |  |
| 马来西亚 | KAFBMYK2 | KAF Digital Bank |  |
| 马来西亚 | MERCHANTRADE | MERCHANTRADE |  |
| 马来西亚 | SHOPEE | Shopee |  |
| 马来西亚 | AGRO | Agrobank |  |
| 马来西亚 | JPMC | JP Morgan Chase Bank Berhad |  |
| 马来西亚 | FSPYMYNB | Fasspay |  |
| 马来西亚 | KCPMMYK1 | Co-opbank Pertama |  |
| 马来西亚 | SVSBMYNB | Setel |  |
| 马来西亚 | BRNO | DUITNOW TO BUSINESS REGISTRATION |  |
| 马来西亚 | GRAB | GRABPAY |  |
| 马来西亚 | ICNO | DUITNOW TO IC NUMBER |  |
| 马来西亚 | MBNO | DUITNOW TO MOBILE NUMBER |  |
| 马来西亚 | PPNO | DUITNOW TO PASSPORT |  |
| 马来西亚 | RYT | RYT BANK (YTL DIGITAL BANK BERHAD) |  |
| 马来西亚 | SCSAADIQ | STANDARD CHARTERED SAADIQ BHD |  |
| 马来西亚 | ALRAJHI | Alrajhi Bank Malaysia |  |
| 马来西亚 | DUIT | DuitNow |  |
| 马来西亚 | DUITNOWEWALLET | DuitNow EWALLET Bank |  |
| 马来西亚 | TNGQR | Touch'n Go |  |

### 墨西哥

墨西哥

参数补充说明

  
  
  
  

👉 代付参数补充说明

| 参数名称 | 参数名 | 类型 | 可空 | 是否参与签名 | 说明 |
| --- | --- | --- | --- | --- | --- |
| 银行编码 | bankCode | string | 否 | 否 | 参考银行编码说明 |

  
  

---

👉 银行编码说明

如果编码表银行编码(bankCode)里有“钱包编码”，则之后为钱包编码

| 国家 | 银行编码(bankCode) | 银行名称(bankName) | 银行全称 |
| --- | --- | --- | --- |
| 墨西哥 | 37006 | BANCOMEXT |  |
| 墨西哥 | 37009 | BANOBRAS |  |
| 墨西哥 | 37019 | BANJERCITO |  |
| 墨西哥 | 37135 | NAFIN |  |
| 墨西哥 | 37166 | BaBien |  |
| 墨西哥 | 37168 | HIPOTECARIA FED |  |
| 墨西哥 | 40002 | BANAMEX |  |
| 墨西哥 | 40012 | BBVA MEXICO |  |
| 墨西哥 | 40014 | SANTANDER |  |
| 墨西哥 | 40021 | HSBC |  |
| 墨西哥 | 40030 | BAJIO |  |
| 墨西哥 | 40036 | INBURSA |  |
| 墨西哥 | 40042 | MIFEL |  |
| 墨西哥 | 40044 | SCOTIABANK |  |
| 墨西哥 | 40058 | BANREGIO |  |
| 墨西哥 | 40059 | INVEX |  |
| 墨西哥 | 40014 | SANTANDER |  |
| 墨西哥 | 40021 | HSBC |  |
| 墨西哥 | 40030 | BAJIO |  |
| 墨西哥 | 40036 | INBURSA |  |
| 墨西哥 | 40042 | MIFEL |  |
| 墨西哥 | 40044 | SCOTIABANK |  |
| 墨西哥 | 40058 | BANREGIO |  |
| 墨西哥 | 40059 | INVEX |  |
| 墨西哥 | 40060 | BANSI |  |
| 墨西哥 | 40062 | AFIRME |  |
| 墨西哥 | 40072 | BANORTE |  |
| 墨西哥 | 40106 | BANK OF AMERICA |  |
| 墨西哥 | 40108 | MUFG |  |
| 墨西哥 | 40110 | JP MORGAN |  |
| 墨西哥 | 40112 | BMONEX |  |
| 墨西哥 | 40113 | VE POR MAS |  |
| 墨西哥 | 40126 | CREDIT SUISSE |  |
| 墨西哥 | 40127 | AZTECA |  |
| 墨西哥 | 40128 | AUTOFIN |  |
| 墨西哥 | 40129 | BARCLAYS |  |
| 墨西哥 | 40130 | COMPARTAMOS |  |
| 墨西哥 | 40132 | MULTIVA BANCO |  |
| 墨西哥 | 40133 | ACTINVER |  |
| 墨西哥 | 40136 | INTERCAM BANCO |  |
| 墨西哥 | 40137 | BANCOPPEL |  |
| 墨西哥 | 40138 | ABC CAPITAL |  |
| 墨西哥 | 40140 | CONSUBANCO |  |
| 墨西哥 | 40141 | VOLKSWAGEN |  |
| 墨西哥 | 40143 | CIBANCO |  |
| 墨西哥 | 40145 | BBASE |  |
| 墨西哥 | 40147 | BANKAOOL |  |
| 墨西哥 | 40148 | PAGATODO |  |
| 墨西哥 | 40150 | INMOBILIARIO |  |
| 墨西哥 | 40151 | DONDE. |  |
| 墨西哥 | 40152 | BANCREA |  |
| 墨西哥 | 40154 | BANCO COVALTO |  |
| 墨西哥 | 40155 | ICBC |  |
| 墨西哥 | 40156 | SABADELL |  |
| 墨西哥 | 40157 | SHINHAN |  |
| 墨西哥 | 40158 | MIZUHO BANK |  |
| 墨西哥 | 40159 | BANK OF CHINA |  |
| 墨西哥 | 40160 | BANCO S3 |  |
| 墨西哥 | 90600 | MONEXCB |  |
| 墨西哥 | 90601 | GBM |  |
| 墨西哥 | 90602 | MASARI |  |
| 墨西哥 | 90605 | VALUE |  |
| 墨西哥 | 90608 | VECTOR |  |
| 墨西哥 | 90699 | FONDEADORA |  |
| 墨西哥 | 90613 | MULTIVA CBOLSA |  |
| 墨西哥 | 90616 | FINAMEX |  |
| 墨西哥 | 90617 | VALMEX |  |
| 墨西哥 | 90620 | PROFUTURO |  |
| 墨西哥 | 90630 | CB INTERCAM |  |
| 墨西哥 | 90631 | CI BOLSA |  |
| 墨西哥 | 90634 | FINCOMUN |  |
| 墨西哥 | 90638 | NU MEXICO |  |
| 墨西哥 | 90642 | REFORMA |  |
| 墨西哥 | 90646 | STP |  |
| 墨西哥 | 90648 | TACTIV CB |  |
| 墨西哥 | 90652 | CREDICAPITAL |  |
| 墨西哥 | 90653 | KUSPIT |  |
| 墨西哥 | 90656 | UNAGRA |  |
| 墨西哥 | 90659 | ASP INTEGRA OPC |  |
| 墨西哥 | 90670 | LIBERTAD |  |
| 墨西哥 | 90677 | CAJA POP MEXICA |  |
| 墨西哥 | 90680 | CRISTOBAL COLON |  |
| 墨西哥 | 90683 | CAJA TELEFONIST |  |
| 墨西哥 | 90684 | TRANSFER |  |
| 墨西哥 | 90685 | FONDO (FIRA) |  |
| 墨西哥 | 90686 | INVERCAP |  |
| 墨西哥 | 90689 | FOMPED |  |
| 墨西哥 | 90703 | TESORED |  |
| 墨西哥 | 90706 | ARCUS |  |
| 墨西哥 | 90710 | NVIO |  |
| 墨西哥 | 90728 | SPIN BY OXXO |  |
| 墨西哥 | 90902 | INDEVAL |  |
| 墨西哥 | 90903 | CoDi Valida |  |
| 墨西哥 | 2001 | BANXICO |  |
| 墨西哥 | 91802 | BANAMEX2 |  |
| 墨西哥 | 90661 | KLAR |  |
| 墨西哥 | 90814 | SANTANDER2\* |  |
| 墨西哥 | 91812 | BBVA BANCOMER2 |  |
| 墨西哥 | 91814 | SANTANDER2 |  |
| 墨西哥 | 91821 | HSBC2 |  |
| 墨西哥 | 91872 | BANORTE2 |  |
| 墨西哥 | 91927 | AZTECA2 |  |
| 墨西哥 | 86000 | TEST\* |  |
| 墨西哥 | 90688 | CREDICLUB |  |
| 墨西哥 | 90723 | Cuenca |  |
| 墨西哥 | 90722 | Mercado Pago W |  |
| 墨西哥 | 90901 | CLS |  |
| 墨西哥 | 90720 | MexPago |  |
| 墨西哥 | 40124 | CITI MEXICO |  |
| 墨西哥 | 90732 | Peibo |  |
| 墨西哥 | 90715 | CASHI CUENTA |  |
| 墨西哥 | 40167 | HEY BANCO |  |
| 墨西哥 | 90734 | FINCO PAY |  |
| 墨西哥 | 90721 | ALBO |  |
| 墨西哥 | 90729 | Dep y Pag Dig |  |
| 墨西哥 | 90725 | COOPDESARROLLO |  |

### 缅甸

缅甸

参数补充说明

👉 代收参数补充说明

| 参数名称 | 参数名 | 类型 | 可空 | 是否参与签名 | 说明 |
| --- | --- | --- | --- | --- | --- |
| 银行编码 | bankCode | string | 否 | 否 | 1、银行卡收款，请根据实际情况填写,若无编码可填bankCode。 虚拟货币USDT收款，可以为空。 |
| 银行名称 | bankName | string | 否 | 否 | 虚拟货币USDT收款时，可以为空。 |
| 付款人id | payUserId | string | 否 | 否 | 扩展参数extParams对象内字段,付款人唯一识别值 |

扩展字段extParams结构：

```
{
"payUserId": "11111"
}
```

  
  
  
  
  
  

---

### 孟加拉

孟加拉

参数补充说明

👉 代收参数补充说明

| 参数名称 | 参数名 | 类型 | 可空 | 是否参与签名 | 说明 |
| --- | --- | --- | --- | --- | --- |
| 付款人姓名 | payName | string | 是 | 否 | 用于订单实名制，非真实姓名请勿传送，用于不需要实名制的通道或您未开启实名制功能时可留空 |
| 付款人ID | payUserId | string | 否 | 否 | 扩展参数extParams对象内字段：付款人id，付款人唯一识别值，最多50字 |

扩展字段extParams结构：

```
{
"payUserId": "11111"
}
```

  
  
  
  

👉 代付参数补充说明

| 参数名称 | 参数名 | 类型 | 可空 | 是否参与签名 | 说明 |
| --- | --- | --- | --- | --- | --- |
| 银行名称 | bankName | string | 否 | 否 | 虚拟货币USDT收款时，可以为空。 |
| 银行编码 | bankCode | string | 否 | 否 | 1、银行卡收款，请根据实际情况填写,若无编码可填bankCode。 虚拟货币USDT收款，可以为空。 |
| 收款人电话 | phoneNum | string | 否 | 否 | 扩展参数extParams对象内字段，可留空 |
| 邮箱 | email | string | 否 | 否 | 扩展参数extParams对象内字段，邮箱地址 |

扩展字段extParams结构：

```
{
"phoneNum": "11111" ,
"email": "example@email.com"
}
```

  
  

---

### 巴西

巴西

参数补充说明

👉 代收参数补充说明

| 参数名称 | 参数名 | 类型 | 可空 | 是否参与签名 | 说明 |
| --- | --- | --- | --- | --- | --- |
| 扩展字段 | extParams | string | 否 | 否 | JSON字段，代收代付都需要传 |

扩展字段extParams结构：

```
{
"docNumber": "111111" ,
"docName": "11111" ,
"docType": "CNPJ"
}
```

docNumber:付款人ID, 巴西个人传CPF(纯数字), 巴西公司传CNPJ(纯数字), 巴西支付服务商识别码(EVP)

docName:付款人名称, 巴西个人传个人姓名, 巴西公司传公司名称

docType:证件类型:CPF CNPJ EVP

  
  
  
  

👉 代付参数补充说明

| 参数名称 | 参数名 | 类型 | 可空 | 是否参与签名 | 说明 |
| --- | --- | --- | --- | --- | --- |
| 银行编码 | bankCode | string | 否 | 否 | 参考银行编码说明 |
| 扩展字段 | extParams | string | 否 | 否 | JSON字段，代收代付都需要传 |

扩展字段extParams结构：

```
{
"docNumber": "111111" ,
"docName": "11111" ,
"docType": "CNPJ"
}
```

docNumber:付款人ID, 巴西个人传CPF(纯数字), 巴西公司传CNPJ(纯数字), 巴西支付服务商识别码(EVP)

docName:付款人名称, 巴西个人传个人姓名, 巴西公司传公司名称

docType:证件类型:CPF CNPJ EVP

  
  

---

👉 银行编码说明

如果编码表银行编码(bankCode)里有“钱包编码”，则之后为钱包编码

| 国家 | 银行编码(bankCode) | 银行名称(bankName) | 银行全称 |
| --- | --- | --- | --- |
| 巴西 | 10506 | CPF |  |
| 巴西 | 10507 | EMAIL |  |
| 巴西 | 10508 | PHONE |  |
| 巴西 | 10509 | EVP |  |
| 巴西 | 10510 | CNPJ |  |

### 越南

越南

参数补充说明

👉 代收参数补充说明

| 参数名称 | 参数名 | 类型 | 可空 | 是否参与签名 | 说明 |
| --- | --- | --- | --- | --- | --- |
| 银行编码 | bankCode | string | 否 | 否 | 扩展字段extParams，参考银行编码说明 |

扩展字段extParams结构：

```
{
"bankCode": "ABB"
}
```

  
  
  
  

👉 代付参数补充说明

| 参数名称 | 参数名 | 类型 | 可空 | 是否参与签名 | 说明 |
| --- | --- | --- | --- | --- | --- |
| 银行编码 | bankCode | string | 否 | 否 | 参考银行编码说明 |

  
  

---

👉 银行编码说明

如果编码表银行编码(bankCode)里有“钱包编码”，则之后为钱包编码

| 国家 | 银行编码(bankCode) | 银行名称(bankName) | 银行全称 |
| --- | --- | --- | --- |
| 越南 | ABB | ABBANK - NH TMCP AN BINH |  |
| 越南 | ACB | ACB - NH TMCP A CHAU |  |
| 越南 | AGR | AGRIBANK - NH NONG NGHIEP VA PHAT TRIEN NONG THON |  |
| 越南 | ANZ | ANZ Bank Vietnam |  |
| 越南 | ANZVTR | C.ty cho thuê TC ANZ-Vtrac |  |
| 越南 | BAB | BAB\_Bac A Bank |  |
| 越南 | BacABank | BacABank - North Asia Bank |  |
| 越南 | BKB | Bangkok Bank Vietnam |  |
| 越南 | BFCE | BPCE IOM bank |  |
| 越南 | BIDC | Ngan hang Dau tu va Phat trien Campuchia – Chi nhanh Ha Noi |  |
| 越南 | BIDV | BIDV - NH TMCP DAU TU VA PHAT TRIEN VN |  |
| 越南 | BNK | Busan Bank Co., Ltd |  |
| 越南 | BNP | Ngân hàng BNP Paribas |  |
| 越南 | BNPHCM | BNP Paribas - Ho Chi Minh City Branch |  |
| 越南 | BNPHN | BNP Paribas - Ha Noi Branch |  |
| 越南 | BOC | Bank Of China - HCMC Branch |  |
| 越南 | BOCHK | Bank of China (Hongkong) Limited - Ho Chi Minh City Branch |  |
| 越南 | BOCOM | Bank of Communications Limited |  |
| 越南 | BOIHCM | BankOfIndia - HCM Branch |  |
| 越南 | BOI | Bank of India |  |
| 越南 | BPCEIOM | NH BPCEIOM CN TPHCM |  |
| 越南 | BSP | SINOPAC bank |  |
| 越南 | Busan | BUSAN BANK – HCM Branch |  |
| 越南 | BVB | BVB - NH TMCP BAO VIET |  |
| 越南 | VCAPB | BVBank - NH TMCP Ban Viet |  |
| 越南 | TIMO | BVBank Timo - Viet Capital Bank |  |
| 越南 | CAKE | TMCP Viet Nam Thinh Vuong - Ngan hang so CAKE by VPBank |  |
| 越南 | CALYON | CALYON BANK |  |
| 越南 | TCCS | C.ty TC Cao Su |  |
| 越南 | CATHUB | Cathay United Bank |  |
| 越南 | CBB | CBBank - Vietnam Construction Bank |  |
| 越南 | CCB | China Construction Bank Corp |  |
| 越南 | CFJSC | Cement Finance Joint Stock Company |  |
| 越南 | CHILC | Chailease International Leasing Company Ltd |  |
| 越南 | CIMB | CIMB - NGAN HANG TNHH MTV CIMB VIET NAM |  |
| 越南 | CIMBVN | CIMB Vietnam |  |
| 越南 | CITI | Citibank Vietnam |  |
| 越南 | CitibankHCM | Ngan hang Citibank N.A CN TP HCM |  |
| 越南 | COOP | COOPBANK - NH Hop tac xa Viet Nam |  |
| 越南 | CACIB | Crédit Agricole Corporate And Investment Bank - Ho Chi Minh City Branch |  |
| 越南 | CTBC | CTBC Bank - HCMC Branch |  |
| 越南 | CUBCL | Cathay United Bank - Chu Lai bracnch |  |
| 越南 | CUBHCM | Cathay United Bank - Ho Chi Minh City Branch |  |
| 越南 | DBS | Deutsche Bank Vietnam |  |
| 越南 | DBSHCM | DBS Bank LTD Ho Chi Minh Branch |  |
| 越南 | MBHN | Maybank Hanoi |  |
| 越南 | DBHCM | Daegu Bank - Ho Chi Minh City Branch |  |
| 越南 | DONGA | DONGABANK - NH TMCP DONG A |  |
| 越南 | DVC | DVC |  |
| 越南 | DONGNA | NH NH TNHH E.SUN CN Dong Nai |  |
| 越南 | ESB | E.SUN BANK |  |
| 越南 | EVN | EVN Finance Joint Stock Company |  |
| 越南 | EIB | EXIMBANK - NH TMCP XUAT NHAP KHAU |  |
| 越南 | FCB | First Commercial Bank Ha Noi |  |
| 越南 | FIRSTBANK | First Commercial Bank - Ha Noi Branch |  |
| 越南 | FUBON | Taipei Fubon Commercial Bank |  |
| 越南 | FUBONHCM | NHTM Taipei Fubon CN TP HCM |  |
| 越南 | GPB | GPBANK - NH TM TNHH MTV DAU KHI TOAN CAU |  |
| 越南 | HANABANK | Hana Bank CN TP Hồ Chí Minh |  |
| 越南 | HANDICO | Handico Finance Joint Stock Company |  |
| 越南 | ABCHN | Agricultural Bank of China Limited - Ha Noi Branch |  |
| 越南 | HDSFC | HD Saison Finance Company Ltd |  |
| 越南 | HDB | HDBANK - NH TMCP PHAT TRIEN TP.HO CHI MINH |  |
| 越南 | HKSB | NH The Hongkong and Shanghai |  |
| 越南 | HLB | HLB - NH TNHH MTV HONGLEONG VIET NAM |  |
| 越南 | HCVFC | Home Credit Vietnam Finance Company Ltd |  |
| 越南 | HSBC | HSBC Bank Vietnam |  |
| 越南 | HNCB | Hua Nan Commercial Bank - HCMC Branch |  |
| 越南 | IBK | Industrial Bank of Korea - HCMC Branch |  |
| 越南 | IBKHN | IBK BANK - Ha Noi Branch |  |
| 越南 | IBKHN | Industrial Bank of Korea - Hanoi Branch |  |
| 越南 | IBKHCM | Industrial Bank of Korea - Ho Chi Minh City Branch |  |
| 越南 | ICBC | Mega ICBC Bank - HCMC Branch |  |
| 越南 | IVB | IVB - NH TNHH INDOVINA |  |
| 越南 | JPMORGAN | JPMORGAN Chase Bank |  |
| 越南 | JACCS | Cong ty Tai chinh JACCS |  |
| 越南 | JPMORGANHCM | JPMORGAN CHASE N.A - HCMC Branch |  |
| 越南 | Kookmin\_HN | Kookmin Bank - Ha Noi Branch |  |
| 越南 | KBANK | KASIKORNBANK public company limited |  |
| 越南 | KDB | NH Cong nghiep Han Quoc CN Ha Noi |  |
| 越南 | KEBHANAHN | KEB HanaBank - Hanoi Branch |  |
| 越南 | KEBHanaHCM | KEB HanaBank - Ho Chi Minh Branch |  |
| 越南 | Kexim | Kexim Vietnam Leasing Company |  |
| 越南 | KLB | KLB - NH TMCP KIEN LONG |  |
| 越南 | Kookmin\_HN | Kookmin Bank - Hanoi Branch |  |
| 越南 | Kookmin\_HCM | Kookmin Bank - Ho Chi Minh Branch |  |
| 越南 | Liobank | NH TMCP Phuong Dong (Liobank) |  |
| 越南 | LVB | LPBANK - NH TMCP BUU DIEN LIEN VIET |  |
| 越南 | MAFC | Mirae Asset Finance Company VN |  |
| 越南 | MSB | Maritime Bank Finance Company Ltd |  |
| 越南 | MSB | MARITIMEBANK - NH TMCP HANG HAI |  |
| 越南 | MAYBANK | Maybank - HCMC Branch |  |
| 越南 | MAYBANKHCM | Malayan Banking Berhad - Ho Chi Minh City Branch |  |
| 越南 | MB | MB - NH TMCP QUAN DOI |  |
| 越南 | Mizuho | UNITED OVERSEAR BANK HCM |  |
| 越南 | MUFG | MUFG Bank Hanoi |  |
| 越南 | NAB | NAMABANK - NH TMCP NAM A |  |
| 越南 | NCB | NCB - NH TMCP QUOC DAN |  |
| 越南 | CATHB | Cathay Bank |  |
| 越南 | NongHyup | Nonghuyp bank - Ha Noi Branch |  |
| 越南 | OCB | OCB - NH TMCP PHUONG DONG |  |
| 越南 | OCBC | Oversea - Chinese banking Corporation LTD |  |
| 越南 | OJB | OCEANBANK - NH TMCP DAI DUONG |  |
| 越南 | PBVN | PBVN - NH TNHH MTV PUBLIC VIET NAM |  |
| 越南 | PGB | PGBANK - NH TMCP THINH VUONG VA PHAT TRIEN |  |
| 越南 | PVFC | Prudential Vietnam Finance Company Ltd |  |
| 越南 | PTFC | Post and Telecommunication Fiannce Company Ltd |  |
| 越南 | PVCOM | PVCOMBANK - NH TMCP DAI CHUNG VIET NAM |  |
| 越南 | PVCOMNA | PVCombank-NAPAS |  |
| 越南 | QTDC | Quy tin dung co so |  |
| 越南 | STB | SACOMBANK - NH TMCP SAI GON THUONG TIN |  |
| 越南 | SGB | SAIGONBANK - NH TMCP SAI GON CONG THUONG |  |
| 越南 | SBV | SBV - The state bank of VietNam |  |
| 越南 | SCB | SCB - NH TMCP SAI GON |  |
| 越南 | SCSB | Shanghai Commercial & Savings Bank Ltd. - Dong Nai Branch |  |
| 越南 | SEAB | SEABANK - NH TMCP DONG NAM A |  |
| 越南 | SHCSB | The Shanghai C S Bank CN Dong Nai |  |
| 越南 | SHB | SHB - NH TMCP SAI GON - HA NOI |  |
| 越南 | SHBVN | SHBVN - NH TNHH MTV SHINHAN VN |  |
| 越南 | SHINHAN | Cong ty Tai chinh TNHH MTV Shinhan Viet Nam |  |
| 越南 | SinoPac | Bank SinoPac – HCMC Branch |  |
| 越南 | SMBC | Sumitomo Mitsui Banking Corp |  |
| 越南 | TCSD | C.ty cổ phần TC Sông Đà |  |
| 越南 | SC | TNHH MTV Standard Chartered Bank (Vietnam) Limited |  |
| 越南 | TPFUBON | TAIPEI FUBON COMMERCIAL BANK |  |
| 越南 | TCFC | Technological and Commercial Finance Company Ltd |  |
| 越南 | TCB | TECHCOMBANK - NH TMCP KY THUONG |  |
| 越南 | TYTFS | Toyota Financial Services Vietnam Company Ltd |  |
| 越南 | TPB | TPBANK - NH TMCP TIEN PHONG |  |
| 越南 | UBANK | TMCP Viet Nam Thinh Vuong - Ngan hang so Ubank by VPBank |  |
| 越南 | KLB | UMEE by Kienlongbank |  |
| 越南 | UOB | United Overseas Bank (Vietnam) Limited |  |
| 越南 | UOBHN | United Overseas Bank (Vietnam) Limited - Ha Noi Branch |  |
| 越南 | VAB | VAB - NH TMCP VIET A |  |
| 越南 | VBSP | VBSP - Ngan hang Chinh sach Xa hoi |  |
| 越南 | VDB | NH Phat trien Viet Nam |  |
| 越南 | VIB | VIB - NH TMCP QUOC TE VIET NAM |  |
| 越南 | VHB | NHTMCP Viet Hoa |  |
| 越南 | VIETB | VIETBANK - NH TMCP VIET NAM THUONG TIN |  |
| 越南 | VCB | VIETCOMBANK - NH TMCP NGOAI THUONG |  |
| 越南 | CTG | VIETINBANK - NH TMCP CONG THUONG |  |
| 越南 | VIETTEL | Viettel Money - TCT DV so Viettel - CN Tap doan CN VT Quan doi |  |
| 越南 | Vikki | Vikki by HDBank |  |
| 越南 | VILC | Vietnam International Leasing Company Ltd |  |
| 越南 | VFJSC | Vinaconex-Viettel Finance Joint Stock Company |  |
| 越南 | VINASHIN | VINASHIN Finance Leasing Company Ltd |  |
| 越南 | VBDN | Vinasiam bank - Dong Nai Branch |  |
| 越南 | VNPT | VNPT Money - TT DV TC so VNPT - CN Tong cong ty truyen thong |  |
| 越南 | VPB | VPBANK - NH TMCP VIET NAM THINH VUONG |  |
| 越南 | VRB | VRB - NH LIEN DOANH VIET NGA |  |
| 越南 | VST | Vietnam State Treasury |  |
| 越南 | VTB | NHTMCP Vung tau |  |
| 越南 | Woori | NGAN HANG WOORI VIET NAM |  |
| 越南 | Wooribank | Wooribank\_Woori Bank Vietnam Limited |  |
| 越南 | WOO | Wooribank Vietnam |  |
| 越南 | VNCB | National Citizen Bank |  |
| 越南 | VIETA | VietABank |  |
| 越南 | MBV | Military Bank |  |
| 越南 | KLB | Kien Long Joint-stock Commercial Bank (KienLongBank) |  |
| 越南 | YOLO | Ngân hàng số VPDirect |  |
| 越南 | VNCB | National Citizen Bank |  |
| 越南 | VIETA | VietABank |  |
| 越南 | MBV | Military Bank |  |
| 越南 | KLB | Kien Long Joint-stock Commercial Bank (KienLongBank) |  |
| 越南 | YOLO | Ngân hàng số VPDirect |  |
| 越南 | ASIAB | Asia Bank |  |
| 越南 | MBB | MBBank |  |
| 越南 | BAOVN | BaoViet |  |
| 越南 | NAMAB | Nam A Bank |  |
| 越南 | PUBB | Public Bank |  |
| 越南 | LVPB | LienVietPostBank |  |
| 越南 | SCB | SCBank |  |
| 越南 | IDCAMHB | Bank for Investment and Development of Cambodia - Hanoi Branch |  |
| 越南 | SPBVN | Vietnam Bank for Social Policies |  |
| 越南 | MOMO | MoMo eWallet |  |
| 越南 | VIB | Vietnam International Commercial Joint Stock Bank |  |
| 越南 | OCB | Orient Commetcial Joint Stock Bank |  |
| 越南 | SHB | Hanoi Commercial Joint Stock Bank |  |
| 越南 | ABB | An Binh Commercial Joint Stock Bank |  |
| 越南 | SHBVN | Shinhan Bank |  |
| 越南 | VRBANK | Vietnam-Russia Bank |  |

### 厄瓜多尔

厄瓜多尔

参数补充说明

👉 代收参数补充说明

| 参数名称 | 参数名 | 类型 | 可空 | 是否参与签名 | 说明 |
| --- | --- | --- | --- | --- | --- |
| 扩展字段 | extParams | string | 否 | 否 | 扩展字段JSON格式 |

扩展字段extParams结构：

```
{
"firstname": "Tomas" ,
"lastname": "Lee" ,
"beneficiaryType": "CI" ,
"beneficiaryId": "2421124120" ,
"phone": "+573991111" ,
"email": "tomas.lee@gmail.com"
}
```

firstname:客户名  
lastname : 客户姓  
beneficiaryType : 用户身份类型(CI;RUC;PAS)  
beneficiaryId : 用户身份id  
phone : 客户手机号  
email : 客户邮箱  
以上信息需替换成客户的真实信息

  
  
  
  

👉 代付参数补充说明

| 参数名称 | 参数名 | 类型 | 可空 | 是否参与签名 | 说明 |
| --- | --- | --- | --- | --- | --- |
| 银行编码 | bankCode | string | 否 | 否 | 参考银行编码说明 |
| 扩展字段 | extParams | string | 否 | 否 | JSON字段 |

扩展字段extParams结构：

```
{
"beneficiaryType": "1" ,
"beneficiaryId": "4040530400" ,
"beneficiaryAccountType": "1"
}
```

beneficiaryType : 身份类型(Cedula:1;PAS:2;RUC:3)  
beneficiaryId : 身份ID  
beneficiaryAccountType : 收款人账号类型(CHECKING:1;SAVINGS:2)  
以上信息需替换成客户的真实信息

  
  

---

👉 银行编码说明

如果编码表银行编码(bankCode)里有“钱包编码”，则之后为钱包编码

| 国家 | 银行编码(bankCode) | 银行名称(bankName) | 银行全称 |
| --- | --- | --- | --- |
| 厄瓜多尔 | 010 | Banco Pichincha C.A. |  |
| 厄瓜多尔 | 017 | Banco de Guayaquil S.A |  |
| 厄瓜多尔 | 024 | Banco City Bank |  |
| 厄瓜多尔 | 025 | Banco Machala |  |
| 厄瓜多尔 | 029 | Banco de Loja |  |
| 厄瓜多尔 | 030 | Banco del Pacifico |  |
| 厄瓜多尔 | 032 | Banco Internacional |  |
| 厄瓜多尔 | 034 | Banco Amazonas |  |
| 厄瓜多尔 | 035 | Banco del Austro |  |
| 厄瓜多尔 | 036 | Produbanco/Promerica |  |
| 厄瓜多尔 | 037 | Banco Bolivariano |  |
| 厄瓜多尔 | 039 | Comercial de Manabi |  |
| 厄瓜多尔 | 042 | Banco General Ruminahui S.A. |  |
| 厄瓜多尔 | 043 | Banco del Litoral S.A. |  |
| 厄瓜多尔 | 059 | Banco Solidario |  |
| 厄瓜多尔 | 060 | Banco Procredit S.A. |  |
| 厄瓜多尔 | 061 | Banco Capital |  |
| 厄瓜多尔 | 065 | Banco Desarrollo de Los Pueblos S.A. |  |
| 厄瓜多尔 | 066 | Banecuador B.P. |  |
| 厄瓜多尔 | 201 | Banco Delbank S.A. |  |
| 厄瓜多尔 | 213 | Cooperativa de Ahorro y Crédito JEP |  |

### 阿根廷

无新增参数说明

### 智利

智利

参数补充说明

👉 代收参数补充说明

| 参数名称 | 参数名 | 类型 | 可空 | 是否参与签名 | 说明 |
| --- | --- | --- | --- | --- | --- |
| 扩展字段 | extParams | string | 否 | 否 | 扩展字段JSON格式 |

扩展字段extParams结构：

```
{
"firstname": "Tomas" ,
"lastname": "Lee" ,
"beneficiaryType": "RUT" ,
"beneficiaryId": "242112412" ,
"phone": "254112018639" ,
"email": "tomas.lee@gmail.com"
}
```

firstname:客户名  
lastname:客户姓  
beneficiaryType:用户身份类型(RUT,PP)  
beneficiaryId:用户身份id  
phone:客户手机号  
email:客户邮箱  
以上信息需替换成客户的真实信息

  
  
  
  

👉 代付参数补充说明

| 参数名称 | 参数名 | 类型 | 可空 | 是否参与签名 | 说明 |
| --- | --- | --- | --- | --- | --- |
| 银行编码 | bankCode | string | 否 | 否 | 参考银行编码说明 |
| 扩展字段 | extParams | string | 否 | 否 | JSON字段 |

扩展字段extParams结构：

```
{
"beneficiaryType": "1" ,
"beneficiaryId": "27344777-6" ,
"beneficiaryBankType": "3"
}
```

beneficiaryType:身份类型(1:RUT)  
beneficiaryId:身份ID  
beneficiaryAccountType:收款人账号类型(0:CHECKING;1:SAVINGS;2:VISTA;3:RUT)   
以上信息需替换成客户的真实信息

  
  

---

👉 银行编码说明

如果编码表银行编码(bankCode)里有“钱包编码”，则之后为钱包编码

| 国家 | 银行编码(bankCode) | 银行名称(bankName) | 银行全称 |
| --- | --- | --- | --- |
| 智利 | 001 | Banco de Chile - Edwards |  |
| 智利 | 009 | Banco Internacional |  |
| 智利 | 012 | Banco Estado (Banco del Estado de Chile) |  |
| 智利 | 014 | Scotiabank |  |
| 智利 | 016 | BCI (Bco de Credito e Inv) |  |
| 智利 | 017 | Banco do Brasil |  |
| 智利 | 027 | Itau-Corpbanca |  |
| 智利 | 028 | Banco Bice |  |
| 智利 | 031 | Hsbc Bank |  |
| 智利 | 035 | Banco Santiago |  |
| 智利 | 037 | Banco Santander |  |
| 智利 | 039 | Itau Chile |  |
| 智利 | 041 | JP Morgan Chase Bank N.A. |  |
| 智利 | 043 | Banco de La Nacion Argentina |  |
| 智利 | 045 | The bank of Tokio-Mitsubishi UFJ, LTD |  |
| 智利 | 049 | Banco Security |  |
| 智利 | 051 | Banco Falabella |  |
| 智利 | 052 | Deutsche Bank (Chile) |  |
| 智利 | 053 | Banco Ripley |  |
| 智利 | 054 | Rabobank |  |
| 智利 | 055 | Banco Consorcio |  |
| 智利 | 056 | Banco Penta |  |
| 智利 | 057 | Banco Paris |  |
| 智利 | 059 | Banco Ptg Pactual |  |
| 智利 | 099 | Banco Nuevo |  |
| 智利 | 152 | Prepago Los Heroes |  |
| 智利 | 504 | BBVA (Bco Bilbao Vizcaya Arg) |  |
| 智利 | 507 | Banco del Desarrollo |  |
| 智利 | 672 | Coopeuch |  |

### 秘鲁

秘鲁

参数补充说明

👉 代收参数补充说明

| 参数名称 | 参数名 | 类型 | 可空 | 是否参与签名 | 说明 |
| --- | --- | --- | --- | --- | --- |
| 客户名 | firstname | string | 否 | 否 | 客户名，扩展参数extParams对象内字段 |
| 客户姓 | lastname | string | 否 | 否 | 客户姓，扩展参数extParams对象内字段 |
| 用户身份类型 | beneficiaryType | string | 否 | 否 | 用户身份类型(DNI,CE,RUC,PAS)，扩展参数extParams对象内字段 |
| 用户身份id | beneficiaryId | string | 否 | 否 | 用户身份id，扩展参数extParams对象内字段 |
| 客户手机号 | phone | string | 否 | 否 | 客户手机号，扩展参数extParams对象内字段 |
| 客户邮箱 | email | string | 否 | 否 | 客户邮箱，扩展参数extParams对象内字段 |

扩展字段extParams结构：

```
{
"firstname": "Tomas" ,
"lastname": "Lee" ,
"beneficiaryType": "DNI" ,
"beneficiaryId": "242112412" ,
"phone": "254112018639" ,
"email": "tomas.lee@gmail.com"
}
```

  
  
  
  

👉 代付参数补充说明

| 参数名称 | 参数名 | 类型 | 可空 | 是否参与签名 | 说明 |
| --- | --- | --- | --- | --- | --- |
| 银行编码 | bankCode | string | 否 | 否 | 参考银行编码表 |
| 身份类型 | beneficiaryType | string | 否 | 否 | 身份类型(1:DNI 2:PAS 3:CE 4:RUC),扩展参数extParams对象内字段 |
| 身份ID | beneficiaryId | string | 否 | 否 | 身份ID,扩展参数extParams对象内字段 |
| 收款人账号类型 | beneficiaryBankType | string | 否 | 否 | 收款人账号类型(0:CHECKING;1:SAVINGS),扩展参数extParams对象内字段 |
| 收款银行CCI账号 | recipientCardNo | string | 否 | 否 | 收款银行CCI账号,扩展参数extParams对象内字段 |

扩展字段extParams结构：

```
{
"beneficiaryType": "1" ,
"beneficiaryId": "40405304" ,
"beneficiaryBankType": "0" ,
"recipientCardNo": "11111"
}
```

  
  

---

👉 银行编码说明

如果编码表银行编码(bankCode)里有“钱包编码”，则之后为钱包编码

| 国家 | 银行编码(bankCode) | 银行名称(bankName) | 银行全称 |
| --- | --- | --- | --- |
| 秘鲁 | 001 | Banco Continental |  |
| 秘鲁 | 002 | Banco de Credito |  |
| 秘鲁 | 003 | Interbank |  |
| 秘鲁 | 004 | Scotiabank |  |
| 秘鲁 | 005 | Banco de Comercio |  |
| 秘鲁 | 006 | Banco Interamericano de Finanzas (BanBif) |  |
| 秘鲁 | 007 | Banco Pichincha |  |
| 秘鲁 | 008 | Citibank |  |
| 秘鲁 | 009 | MiBanco |  |
| 秘鲁 | 011 | Banco GNB |  |
| 秘鲁 | 012 | Banco Falabella |  |
| 秘鲁 | 013 | Banco Ripley |  |
| 秘鲁 | 014 | Banco Santander |  |
| 秘鲁 | 015 | Banco Azteca |  |
| 秘鲁 | 016 | Banco Cencosud |  |
| 秘鲁 | 017 | ICBC PERU BANK |  |
| 秘鲁 | 018 | Banco de la Naci贸n |  |
| 秘鲁 | 019 | Caja Arequipa |  |
| 秘鲁 | 020 | Caja Cusco |  |
| 秘鲁 | 021 | Caja Huancayo |  |
| 秘鲁 | 022 | Caja Maynas |  |
| 秘鲁 | 023 | Caja Metropolitana |  |
| 秘鲁 | 024 | Caja Municipal Ica |  |
| 秘鲁 | 025 | Caja Piura |  |
| 秘鲁 | 026 | Caja Sullana |  |
| 秘鲁 | 027 | Caja Tacna |  |
| 秘鲁 | 028 | Caja Trujillo |  |

### 泰国

泰国

参数补充说明

👉 代收参数补充说明

| 参数名称 | 参数名 | 类型 | 可空 | 是否参与签名 | 说明 |
| --- | --- | --- | --- | --- | --- |
| 付款人姓名 | payName | string | 是 | 否 | 付款人姓名 |
| 付款人ID | payUserId | string | 否 | 否 | 付款人ID，扩展参数extParams对象内字段 |
| 付款银行账号 | acctId | string | 否 | 否 | 付款银行账号，扩展参数extParams对象内字段 |
| 付款银行编码 | customerBankCode | string | 否 | 否 | 付款银行编码，扩展参数extParams对象内字段 |

扩展字段extParams结构：

```
{
"payUserId": "55158" ,
"acctId": "000000123" ,
"customerBankCode": "ANZ"
}
```

  
  
  
  

👉 代付参数补充说明

| 参数名称 | 参数名 | 类型 | 可空 | 是否参与签名 | 说明 |
| --- | --- | --- | --- | --- | --- |
| 银行编码 | bankCode | string | 否 | 否 | 参考银行编码表 |

扩展字段extParams结构：

```
"无"
```

  
  

---

👉 银行编码说明

如果编码表银行编码(bankCode)里有“钱包编码”，则之后为钱包编码

| 国家 | 银行编码(bankCode) | 银行名称(bankName) | 银行全称 |
| --- | --- | --- | --- |
| 泰国 | BAAC | BANK FOR AGRICULTURE AND AGRICULTURAL COOPERATIVES |  |
| 泰国 | BAY | BANK OF AYUDHYA PUBLIC CO., LTD. |  |
| 泰国 | BBL | BANGKOK BANK PUBLIC CO., LTD. |  |
| 泰国 | GSB | GOVERNMENT SAVINGS BANK |  |
| 泰国 | KBANK | KASIKORNBANK PUBLIC CO., LTD. |  |
| 泰国 | KKP | KIATNAKIN BANK PUBLIC CO., LTD. |  |
| 泰国 | KTB | KRUNG THAI BANK PUBLIC CO., LTD. |  |
| 泰国 | SCB | SIAM COMMERCIAL BANK PUBLIC CO., LTD. |  |
| 泰国 | TTB | TMBTHANACHART BANK PUBLIC CO., LTD |  |
| 泰国 | UOBT | UNITED OVERSEAS BANK (THAI) PUBLIC CO., LTD |  |
| 泰国 | CITIB | CITIBANK |  |
| 泰国 | SCBT | STANDARD CHARTERED BANK (THAI) |  |
| 泰国 | CIMB | CIMB THAI BANK |  |
| 泰国 | GHB | THE GOVERNMENT HOUSING BANK |  |
| 泰国 | IBT | ISLAMIC BANK OF THAILAND |  |
| 泰国 | CHICB | INDUSTRIAL AND COMMERCIAL BANK OF CHINALAND AND HOUSES BANK |  |
| 泰国 | KRUNGSRI | KRUNGSRI BANK |  |
| 泰国 | LHBANK | Land and Houses Bank Public Company Limited |  |
| 泰国 | MHCB | Mizuho Corporate Bank Limited |  |
| 泰国 | IBANK | Islamic Bank of Thailand |  |
| 泰国 | TISCO | TISCO Bank Plc. |  |
| 泰国 | TrueMoney | true money |  |
| 泰国 | TBNK | Thanachart Bank |  |
| 泰国 | TMBB | TMB Bank |  |
| 泰国 | SMBC | SUMITOMO MITSUI BANKING CORPORATION |  |
| 泰国 | DB | DEUTSCHE BANK AKTIENGESELLSCHAFT (DB) |  |
| 泰国 | TCRB | THAI CREDIT RETAIL BANK PUBLIC COMPANY LIMITED (TCRB) |  |
| 泰国 | IACBT | INDUSTRIAL AND COMMERCIAL BANK OF CHAINA (THAI) |  |
| 泰国 | HASC | HONGKONG and SHANGHAI CORPORATION LTD. |  |
| 泰国 | BOC | Bank of China |  |
| 泰国 | ICBCT | INDUSTRIAL AND COMMERCIAL BANK OF CHINA |  |
| 泰国 | ISBTC | Iowa State Bank and Trust Company |  |
| 泰国 | BOT | Bank of Thailand |  |
| 泰国 | EXIM | Export-Import Bank of Thailand |  |
| 泰国 | SME | SME Development Bank |  |
| 泰国 | ANZ | Australia and New Zealand Banking Group Limited |  |
| 泰国 | CAPITAL | Bank Capital Indonesia |  |
| 泰国 | LAHRB | LAND AND HOUSES RETAIL BANK PUBLIC COMPANY LIMITED |  |
| 泰国 | BOA | Bank of America |  |
| 泰国 | BNP | BNP Paribask |  |
| 泰国 | CHT | ธนาคารแห่งประเทศจีน (ไทย) จำกัด (มหาชน)์ |  |
| 泰国 | MEGA | Mega International Commercial Bank |  |
| 泰国 | SMBCTB | Sumitomo Mitsui Trust Bank (Thai) Public Company Limited |  |
| 泰国 | JPCB | JPMorgan Chase Bank, N.A., Bangkok Branch |  |
| 泰国 | AIGC | American International Group, Inc. |  |
| 泰国 | BOTM | Bank of Tokyo-Mitsubishi UFJ, Ltd. |  |
| 泰国 | CACIB | Crédit Agricole Corporate and Investment Bank |  |
| 泰国 | IOB | Indian Overseas Bank |  |
| 泰国 | OCBC | Oversea-Chinese Banking Corporation Limited, Bangkok Branch. |  |
| 泰国 | RBOS | The Royal Bank of Scotland plc |  |

### 布基纳法索

布基纳法索

参数补充说明

  
  
  
  

👉 代付参数补充说明

| 参数名称 | 参数名 | 类型 | 可空 | 是否参与签名 | 说明 |
| --- | --- | --- | --- | --- | --- |
| 银行编码 | bankName | string | 否 | 否 | 参考银行编码表 |

扩展字段extParams结构：

```
"无"
```

  
  

---

👉 银行编码说明

如果编码表银行编码(bankCode)里有“钱包编码”，则之后为钱包编码

| 国家 | 银行编码(bankCode) | 银行名称(bankName) | 银行全称 |
| --- | --- | --- | --- |
| 布基纳法索 |  | Plin |  |
| 布基纳法索 |  | BCP |  |
| 布基纳法索 |  | Yape |  |
| 布基纳法索 |  | BBVA |  |
| 布基纳法索 |  | Scotiabank |  |
| 布基纳法索 |  | Interbank |  |

### 菲律宾

菲律宾

参数补充说明

👉 代收参数补充说明

| 参数名称 | 参数名 | 类型 | 可空 | 是否参与签名 | 说明 |
| --- | --- | --- | --- | --- | --- |
| 电话号码 | phone | string | 否 | 否 | 扩展参数extParams对象内字段 |
| 电子邮箱 | email | string | 否 | 否 | 扩展参数extParams对象内字段 |

扩展字段extParams结构：

```
{
"phone": "55158" ,
"email": "441fff@ff.com"
}
```

  
  
  
  

👉 代付参数补充说明

| 参数名称 | 参数名 | 类型 | 可空 | 是否参与签名 | 说明 |
| --- | --- | --- | --- | --- | --- |
| 银行编码 | bankCode | string | 否 | 否 | 参考银行编码表 |
| 电话号码 | phone | string | 否 | 否 | 扩展参数extParams对象内字段 |
| 电子邮箱 | email | string | 否 | 否 | 扩展参数extParams对象内字段 |

扩展字段extParams结构：

```
{
"phone": "55158" ,
"email": "441fff@ff.com"
}
```

  
  

---

👉 银行编码说明

如果编码表银行编码(bankCode)里有“钱包编码”，则之后为钱包编码

| 国家 | 银行编码(bankCode) | 银行名称(bankName) | 银行全称 |
| --- | --- | --- | --- |
| 菲律宾 | gcash | Gcash |  |
| 菲律宾 | bpi | BPI Bank |  |
| 菲律宾 | Unibank | BDO Unibank |  |
| 菲律宾 | mbt | Metropolitan Bank and Trust Co |  |
| 菲律宾 | LBOB | LANDBANK / OFBank |  |
| 菲律宾 | SBC | Security Bank Corporation |  |
| 菲律宾 | UBP | Union Bank of the Philippines |  |
| 菲律宾 | PNB | Philippine National Bank |  |
| 菲律宾 | CBC | China Banking Corporation |  |
| 菲律宾 | EWBC | East West Banking Corporation |  |
| 菲律宾 | RCBC | RCBC/DiskarTech |  |
| 菲律宾 | UCPB | United Coconut Planters Bank (UCPB) |  |
| 菲律宾 | PSB | Philippine Savings Bank |  |
| 菲律宾 | AUB | Asia United Bank Corporation |  |
| 菲律宾 | PBC | Philippine Bank of Communications |  |
| 菲律宾 | DBP | Development Bank of the Philippines |  |
| 菲律宾 | AB | ALLBANK(A Thirft Bank) |  |
| 菲律宾 | Asenso | Rural Bank of Guinobatan / Asenso |  |
| 菲律宾 | BM | Bangko Mabuhay |  |
| 菲律宾 | BC | Bank of Commerce |  |
| 菲律宾 | BK | BanKo,A Subsidiary of BPI |  |
| 菲律宾 | Bayad | CIS Bayad Center / Bayad |  |
| 菲律宾 | BNB | BDO NeTwork Bank |  |
| 菲律宾 | CB | Camalig Bank |  |
| 菲律宾 | CARD Bank | CARD Bank |  |
| 菲律宾 | CLB | Cebuana Lhuillier Bank / Cebuana Xpress |  |
| 菲律宾 | CBS | China Bank Savings |  |
| 菲律宾 | Coins | DCPay / COINS.PH |  |
| 菲律宾 | CTBC | CTBC Bank (Philippines) Corporation |  |
| 菲律宾 | DCDB | Dumaguete City Development Bank |  |
| 菲律宾 | DB | Dungganon Bank |  |
| 菲律宾 | ESB | Equicom Savings Bank, Inc. |  |
| 菲律宾 | GP | GrabPay |  |
| 菲律宾 | ISLA | ISLA Bank |  |
| 菲律宾 | JC | Zybi Tech Inc. / JuanCash |  |
| 菲律宾 | Komo | East West Rural Bank / Komo |  |
| 菲律宾 | LSB | Legazpi Saving Bank |  |
| 菲律宾 | MBS | Malayan Bank Savings and Mortgage Bank, Inc. |  |
| 菲律宾 | MBP | Maybank Philippnies |  |
| 菲律宾 | MCCB | Mindanao Consolidated CoopBank |  |
| 菲律宾 | NB | Netbank |  |
| 菲律宾 | OP | OmniPay, Inc. |  |
| 菲律宾 | PRB | Partner Rural Bank (Cotabato), Inc. |  |
| 菲律宾 | PMP | PayMaya Philippines |  |
| 菲律宾 | PBB | Philippine Business Bank |  |
| 菲律宾 | PTC | Philippine Trust Company |  |
| 菲律宾 | PDB | Producers Bank |  |
| 菲律宾 | QB | Queenbank |  |
| 菲律宾 | QCRB | Quezon Capital Rural Bank |  |
| 菲律宾 | RBB | Robinsons Bank Corporation |  |
| 菲律宾 | SB | Seabank |  |
| 菲律宾 | SP | ShopeePay |  |
| 菲律宾 | SCB | Standard Chartered Bank |  |
| 菲律宾 | STP | Starpay |  |
| 菲律宾 | SLB | Sterling Bank of Asia |  |
| 菲律宾 | SSB | Sun Savings Bank |  |
| 菲律宾 | TC | TayoCash |  |
| 菲律宾 | USB | UCPB Savings Bank |  |
| 菲律宾 | USSC | USSC Monet Services |  |
| 菲律宾 | VB | Veterans Bank |  |
| 菲律宾 | WDB | Wealth Development Bank |  |
| 菲律宾 | usdt-trc | usdt-trc |  |
| 菲律宾 | (TRC) | USDT(TRC) |  |
| 菲律宾 | ERC | USDT-ERC |  |
| 菲律宾 | ALIPAY | Alipay / Lazada Wallet |  |
| 菲律宾 | BCH | Bank of China |  |
| 菲律宾 | BRB | Binangonan Rural Bank / BRBDigital |  |
| 菲律宾 | SME | CARD SME Bank |  |
| 菲律宾 | CPI | CIMB Philippines, Inc. |  |
| 菲律宾 | ERB | Entrepreneur Rural Bank, Inc./ENTRP |  |
| 菲律宾 | GOT | GoTyme Bank |  |
| 菲律宾 | IRI | I-Remit / iCASH |  |
| 菲律宾 | IEM | Infoserve / Nationlink |  |
| 菲律宾 | LDB | Luzon Development Bank |  |
| 菲律宾 | MYA | Maya Bank, Inc. |  |
| 菲律宾 | PAS | Pacific Ace Savings Bank |  |
| 菲律宾 | PPS | PalawanPay |  |
| 菲律宾 | TDB | Tonik Bank |  |
| 菲律宾 | TPI | TraxionPay/DigiCOOP/COOPNET |  |
| 菲律宾 | UDB | UnionDigital Bank |  |
| 菲律宾 | SPP | SpeedyPay/eMango Pay |  |
| 菲律宾 | UNO | UNO Digital Bank |  |
| 菲律宾 | OWN | Own Bank |  |
| 菲律宾 | PDAX | Philippine Digital Asset Exchange, Inc / PDAX |  |
| 菲律宾 | BFS | Bananapay Fintech Services |  |
| 菲律宾 | BBI | Bayanihan Bank Inc. |  |
| 菲律宾 | CBI | Cantilan Bank Inc. |  |
| 菲律宾 | CRBRI | Community Rural Bank of Romblon,Inc. |  |
| 菲律宾 | EPGEC | Easy Pay Global EMI Corp |  |
| 菲律宾 | HSBC | The Hong Kong and Shanghai Banking Corporation Limited, Philippine Branch |  |
| 菲律宾 | INGB | ING Bank N.V. |  |
| 菲律宾 | LFS | Lulu Financial Services |  |
| 菲律宾 | TRBCC | OWN BANK THE RURAL BANK OF CAVITE CITY INC. |  |
| 菲律宾 | PPFSC | PPS-PEPP Financial Services Corporation |  |
| 菲律宾 | RARB | RANG-AY BANK A Rural Bank Inc |  |
| 菲律宾 | SPI | SpeedyPay Inc. |  |
| 菲律宾 | TKWI | TokTok Wallet Inc. |  |
| 菲律宾 | TTC | Topjuan Tech Corporation |  |
| 菲律宾 | UBI | UnoBank Inc. |  |
| 菲律宾 | WPI | Wise Pilipinas, Inc. |  |
| 菲律宾 | BNAP | Banana Fintech / BananaPay |  |
| 菲律宾 | BOC | Bank of CommerceCBI |  |
| 菲律宾 | SHBKP | Shinhan Bank - Manila Branch |  |
| 菲律宾 | CTS | City Savings Bank |  |
| 菲律宾 | CHASP | JP Morgan Chase Bank, N.A- Manila Branch |  |
| 菲律宾 | MHCBP | Mizuho Bank,Ltd. - Manila Branch |  |
| 菲律宾 | RBR | RURAL BANK OF ROSARIO (L.U.), INC. |  |
| 菲律宾 | RBT | RBT BANK, INC. (A RURAL BANK) |  |
| 菲律宾 | QCDFP | Queen City Development Bank |  |
| 菲律宾 | AZB | AUSTRALIA-NEW ZEALAND BANK |  |
| 菲律宾 | BBPC | BANGKOK BANK PUBLIC CO., LTD |  |
| 菲律宾 | FIOOP | First Consolidated Bank, Inc. |  |
| 菲律宾 | CPHIP | PBCOM |  |
| 菲律宾 | SMBC | SUMITOMO MITSUI BANKING CORP |  |
| 菲律宾 | BNSDPI | BANGKO NUESTRA SEÑORA DEL PILAR, INC. |  |
| 菲律宾 | BKKB | BANGKO KABAYAN |  |
| 菲律宾 | TYBKP | Yuanta Savinas Bank Philippines. Inc. |  |
| 菲律宾 | BOFAP | Bank of America, N.A - Manila Branch |  |
| 菲律宾 | UOBP | UNITED OVERSEAS BANK PHILS. |  |
| 菲律宾 | MBTCP | Metrobank |  |
| 菲律宾 | AIIPP | Amanah Islamic Bank |  |
| 菲律宾 | COUKP | Country Builders Bank, Inc |  |
| 菲律宾 | KOEXP | KEB Hana Bank - Manila Branch |  |
| 菲律宾 | RARLP | Rang-Ay Bank, Inc |  |
| 菲律宾 | ACI\_RCBC | Rizal Commercial Banking Corp. |  |
| 菲律宾 | MKRUP | Bank of Makati, Inc. |  |
| 菲律宾 | CUVC | CATHAY UNITED BANK CO., LTD. |  |
| 菲律宾 | CITIP | Citibank, N.A. - Manila Branch |  |
| 菲律宾 | MVSMP | MVSM Bank |  |
| 菲律宾 | BOTKP | MUFG Bank,Ltd. - Manila Branch |  |
| 菲律宾 | IBKOP | Industrial Bank of Korea - Manila |  |
| 菲律宾 | GRBUP | Guagua Rural Bank, Inc. |  |
| 菲律宾 | DEUTP | Deutsche Bank AG - Manila Branch |  |
| 菲律宾 | IORUP | Innovative Bank, Inc. |  |
| 菲律宾 | PTI | Paynamics Technology Inc |  |
| 菲律宾 | VBRI | VIGAN BANCO RURAL INCORPORADA |  |
| 菲律宾 | BOFI | BOF, INC (A RURAL BANK) |  |
| 菲律宾 | PYMGO | PayMongo |  |
| 菲律宾 | MICB | MEGA INTL COMML BANK CO. LTD |  |
| 菲律宾 | RUDIP | Rural Bank of Digos, Inc. |  |
| 菲律宾 | LPBC | LAGUNA PRESTIGE BANKING CORPORATI |  |
| 菲律宾 | ICBC | INDUSTRIAL AND COMMERCIAL BANK OF CHINA |  |
| 菲律宾 | BGB | BPI Direct Banko Inc.,A Savings Bank |  |
| 菲律宾 | DOP | DEVT BANK OF THE PHILIPPINES |  |
| 菲律宾 | MAYA | maya |  |
| 菲律宾 | OMNIPAY | omnipay |  |
| 菲律宾 | GRABPAY | grabpay |  |
| 菲律宾 | UBPH | Union Bank of the Philippines |  |
| 菲律宾 | BDO | BDO Unibank,Inc. |  |
| 菲律宾 | MBTC | Metropolitan Bank and Trust Company |  |
| 菲律宾 | BPIF | Bank of the Philippine Islands / BPI Family |  |
| 菲律宾 | LBPH | Land Bank of the Philippines |  |
| 菲律宾 | DBPH | Development Bank of the Philippines |  |
| 菲律宾 | APH | Alipay Philippines |  |
| 菲律宾 | ABTB | AllBank (A Thrift Bank), Inc. |  |
| 菲律宾 | AUBC | Asia United Bank Corporation |  |
| 菲律宾 | BMAB | Bangko Mabuhay (A Rural Bank), Inc. |  |
| 菲律宾 | BOCHINA | Bank of China |  |
| 菲律宾 | BOCOMMERCE | Bank of Commerce |  |
| 菲律宾 | BDB | BDO Network Bank |  |
| 菲律宾 | BPIDB | BPI Direct BanKo |  |
| 菲律宾 | CBRB | Camalig Bank, Inc. (A Rural Bank) |  |
| 菲律宾 | CANTILAN\_BANK | Cantilan Bank Inc. |  |
| 菲律宾 | CARD\_BANK | CARD BANK Inc. |  |
| 菲律宾 | CSMB | CARD SME Bank,Inc.A Thrift Bank |  |
| 菲律宾 | CLRB | Cebuana Lhuillier Rural Bank,Inc |  |
| 菲律宾 | CBPH | China Bank Savings,Inc. |  |
| 菲律宾 | CIMB | CIMB Philippines,Inc. |  |
| 菲律宾 | CIS | CIS Bayad Center,Inc. |  |
| 菲律宾 | CRBRB | Community Rural Bank of Romblon,Inc. |  |
| 菲律宾 | DCDPH | Dumaguete City Development Bank |  |
| 菲律宾 | DGB | Dungganon Bank (A Microfinance Rural Bank),Inc. |  |
| 菲律宾 | EWC | East West Banking Corporation |  |
| 菲律宾 | EPGEMI | Easy Pay Global EMI Corp |  |
| 菲律宾 | GTB | GoTyme Bank Corporation |  |
| 菲律宾 | HKBSPH | The Hong Kong and Shanghai Banking Corporation Limited, Philippine Branch |  |
| 菲律宾 | INFOSERVE | INFOSERVE INCORPORATED |  |
| 菲律宾 | ING | ING Bank N.V. |  |
| 菲律宾 | IREMIT | I-Remit Inc. |  |
| 菲律宾 | ISLAB | ISLA Bank (A Thrift Bank),Inc. |  |
| 菲律宾 | MBSM | Malayan Bank Savings and Mortgage Bank,Inc. |  |
| 菲律宾 | MAYABANK | MAYA BANK,INC |  |
| 菲律宾 | MAYBANK\_PH | Maybank Philippines,Inc. |  |
| 菲律宾 | MCB | Mindanao Consolidated Cooperative Bank |  |
| 菲律宾 | OWNB | OWN BANK THE RURAL BANK OF CAVITE CITY INC. |  |
| 菲律宾 | PASB | Pacific Ace Savings Bank,Inc. |  |
| 菲律宾 | PRBRB | Partner Rural Bank (Cotabato),Inc. |  |
| 菲律宾 | PDAE | Philippine Digital Asset Exchange |  |
| 菲律宾 | PVB | Philippine Veterans Bank |  |
| 菲律宾 | PHTB | PhilTrust Bank |  |
| 菲律宾 | PPSPEPP | PPS-PEPP Financial Services Corporation |  |
| 菲律宾 | PSBC | Producers Savings Bank Corporation |  |
| 菲律宾 | QCBDB | Queen City Development Bank,Inc. |  |
| 菲律宾 | RANG\_AY\_BANK | RANG-AY BANK A Rural Bank Inc |  |
| 菲律宾 | RBGP | Robinsons Bank Corporation |  |
| 菲律宾 | RBRB | Rural Bank of Guinobatan,Inc. |  |
| 菲律宾 | SBP | Seabank Philippines,Inc. |  |
| 菲律宾 | SBC2 | Security Bank Corporation 2 |  |
| 菲律宾 | ShopeePay | ShopeePay Philippines,Inc. |  |
| 菲律宾 | SPEEDYPAY | SpeedyPay Inc. |  |
| 菲律宾 | STARP | Starpay Corporation |  |
| 菲律宾 | SBAA | Sterling Bank of Asia, Inc.,A Savings Bank |  |
| 菲律宾 | TCI | Tayocash Inc. |  |
| 菲律宾 | TTWI | TokTok Wallet Inc. |  |
| 菲律宾 | TJT | Topjuan Tech Corporation |  |
| 菲律宾 | TP | Traxion Pay Inc. |  |
| 菲律宾 | UCPBSB | UCPB Savings Bank,Inc. |  |
| 菲律宾 | UBSB | Union Digital Bank |  |
| 菲律宾 | UCBPH | United Coconut Planters Bank |  |
| 菲律宾 | UNOB | UnoBank Inc. |  |
| 菲律宾 | USSCMONEY | USSC Money Services, Inc |  |
| 菲律宾 | ZT | Zybi Tech Inc. |  |
| 菲律宾 | MAYAB | Maya Business |  |
| 菲律宾 | MAYABLV3 | Maya Business LV3 |  |
| 菲律宾 | MARIP | MARIBANK PHILIPPINES |  |
| 菲律宾 | SEA | Migrate to MBP |  |
| 菲律宾 | CRMH | CARD MRI Rizal Bank Inc. |  |
| 菲律宾 | MAYC | MarCoPay Inc. |  |
| 菲律宾 | PPBI | Peppermint Bizmoto, Inc. |  |
| 菲律宾 | TFSPH | Toyota Financial Services Philippines Corporation (TFSPH) |  |
| 菲律宾 | ECAS | Ecashpay Asia ECAS |  |
| 菲律宾 | AGBU | AGRIBUSINESS RURAL BANK, INC. |  |
| 菲律宾 | BORR | BANK OF FLORIDA |  |
| 菲律宾 | BIUR | BINAN RURAL BANK, INC |  |
| 菲律宾 | UWCB | CATHAY UNITED BANK CO LTD |  |
| 菲律宾 | GARK | GATEWAY RURAL BANK, INC. |  |
| 菲律宾 | CHAS | JPMORGAN CHASE BANK |  |
| 菲律宾 | LOLP | LOLC BANK PHILIPPINES INC. (A THRIFT BANK) |  |
| 菲律宾 | MLRU | MALARAYAT RURAL BANK, INC. |  |
| 菲律宾 | MOML | MONEY MALL RURAL BANK, INC. |  |
| 菲律宾 | NRSL | NEW RURAL BANK OF SAN LEONARDO (NUEVA ECIJA), INC. |  |
| 菲律宾 | RUAN | RURAL BANK OF ANGELES, INC. |  |
| 菲律宾 | RUBC | RURAL BANK OF BACOLOD CITY, INC. |  |
| 菲律宾 | RUBU | RURAL BANK OF BAUANG, INC |  |
| 菲律宾 | RUPZ | RURAL BANK OF LA PAZ, INC. |  |
| 菲律宾 | RLSK | RURAL BANK OF LEBAK (SULTAN KUDARAT), INC. |  |
| 菲律宾 | RUMN | RURAL BANK OF MANGALDAN, INC. |  |
| 菲律宾 | RUMT | RURAL BANK OF MONTALBAN, INC. |  |
| 菲律宾 | RUPP | RURAL BANK OF PORAC (PAMP), INC. |  |
| 菲律宾 | RUSY | RURAL BANK OF SAGAY, INC. |  |
| 菲律宾 | RSNA | RURAL BANK OF SAN NARCISO, INC. |  |
| 菲律宾 | RUST | RURAL BANK OF SILAY CITY, INC. |  |
| 菲律宾 | RUSG | RURAL BANK OF STA. IGNACIA, INC. |  |
| 菲律宾 | SCUA | SOUTHEAST COUNTRY BANK, INC. (A RURAL BANK) |  |
| 菲律宾 | RUBT | SUMMIT BANK (Rural Bank of Tublay, Inc.) |  |
| 菲律宾 | TAGC | TAGCASH LTD., INC. |  |
| 菲律宾 | COUK | TOP BANK PHILIPPINES, INC. (A RURAL BANK) |  |
| 菲律宾 | ZARU | ZAMBALES RURAL BANK, INC. |  |
| 菲律宾 | IDR\_SUMSEL\_SYARIAH | Bank Sumsel Babel Syariah |  |

### 埃及

埃及

参数补充说明

👉 代收参数补充说明

| 参数名称 | 参数名 | 类型 | 可空 | 是否参与签名 | 说明 |
| --- | --- | --- | --- | --- | --- |
| 用户手机号 | phoneNum | string | 否 | 否 | 扩展参数extParams对象内字段，用户手机号，号码必须是 11 位数字，并且以 010、011、012、013 或 015 开头 |

扩展字段extParams结构：

```
{
"phoneNum": "01088855158"
}
```

  
  
  
  

👉 代付参数补充说明

| 参数名称 | 参数名 | 类型 | 可空 | 是否参与签名 | 说明 |
| --- | --- | --- | --- | --- | --- |
| 银行编码/钱包名称 | bankCode | string | 否 | 是 | 银行编码或钱包名称，参考银行编码表 |
| 商户自定义客户号 | payUserId | string | 否 | 否 | 扩展参数extParams对象内字段 |

扩展字段extParams结构：

```
{
"payUserId": "11"
}
```

  
  

---

👉 银行编码说明

如果编码表银行编码(bankCode)里有“钱包编码”，则之后为钱包编码

| 国家 | 银行编码(bankCode) | 银行名称(bankName) | 银行全称 |
| --- | --- | --- | --- |
| 埃及 | 钱包编码 | 钱包名称 |  |
| 埃及 | 10010 | Vodafone Cash |  |
| 埃及 | 10011 | Axis pay |  |

### 土耳其

土耳其

参数补充说明

👉 代收参数补充说明

| 参数名称 | 参数名 | 类型 | 可空 | 是否参与签名 | 说明 |
| --- | --- | --- | --- | --- | --- |
| 客户名 | firstname | string | 否 | 否 | 扩展参数extParams对象内字段 |
| 客户姓 | lastname | string | 否 | 否 | 扩展参数extParams对象内字段 |
| 邮箱 | email | string | 否 | 否 | 扩展参数extParams对象内字段 |

扩展字段extParams结构：

```
{
"firstname": "James" ,
"lastname": "Taylor" ,
"email": "xxx@gail.com"
}
```

  
  
  
  

👉 代付参数补充说明

| 参数名称 | 参数名 | 类型 | 可空 | 是否参与签名 | 说明 |
| --- | --- | --- | --- | --- | --- |
| 银行编码 | bankCode | string | 否 | 是 | 参考银行编码表 |

  
  

---

👉 银行编码说明

如果编码表银行编码(bankCode)里有“钱包编码”，则之后为钱包编码

| 国家 | 银行编码(bankCode) | 银行名称(bankName) | 银行全称 |
| --- | --- | --- | --- |
| 土耳其 | TGBATRIS | Akbank T.A.S. |  |
| 土耳其 | AKBKTRIS | Türkiye Halk Bankası A.Ş. |  |
| 土耳其 | HALKBTRIS | Kuveyt Türk Katılım Bankası A.Ş. |  |
| 土耳其 | KUVETRIS | ING A.Ş. |  |
| 土耳其 | INGBTRIS | Türkiye Cumhuriyeti Ziraat Bankası A.Ş. |  |
| 土耳其 | TCZBTR2A | Yapı ve Kredi Bankası A.Ş. |  |
| 土耳其 | YAPITRIS | Türk Ekonomi Bankası A.Ş. (TEB) |  |
| 土耳其 | TEBUTRIS | HSBC Bank A.Ş. |  |
| 土耳其 | HSBCTRIS | DenizBank A.Ş. |  |
| 土耳其 | DENITRIS | QNB Finansbank A.Ş. |  |
| 土耳其 | FNNBTRIS | VakıfBank A.Ş. |  |
| 土耳其 | VAKBTRIS | Türkiye İş Bankası A.Ş. |  |

### 摩洛哥

摩洛哥

参数补充说明

  
  
  
  

👉 代付参数补充说明

| 参数名称 | 参数名 | 类型 | 可空 | 是否参与签名 | 说明 |
| --- | --- | --- | --- | --- | --- |
| 银行编码 | bankCode | string | 否 | 是 | 参考银行编码表 |

  
  

---

👉 银行编码说明

如果编码表银行编码(bankCode)里有“钱包编码”，则之后为钱包编码

| 国家 | 银行编码(bankCode) | 银行名称(bankName) | 银行全称 |
| --- | --- | --- | --- |
| 摩洛哥 | 10014 | BEMCE BanK |  |
| 摩洛哥 | 10013 | Al Barid Bank |  |
| 摩洛哥 | 10012 | Cih bank |  |
| 摩洛哥 | 10011 | Attijariwafa banque |  |

### 南非

南非

参数补充说明

  
  
  
  

👉 代付参数补充说明

| 参数名称 | 参数名 | 类型 | 可空 | 是否参与签名 | 说明 |
| --- | --- | --- | --- | --- | --- |
| 银行编码 | bankCode | string | 否 | 是 | 参考银行编码表 |

  
  

---

👉 银行编码说明

如果编码表银行编码(bankCode)里有“钱包编码”，则之后为钱包编码

| 国家 | 银行编码(bankCode) | 银行名称(bankName) | 银行全称 |
| --- | --- | --- | --- |
| 南非 | SAFIN | Sasfin Bank |  |
| 南非 | BIDVEST | Bidvest Bank |  |
| 南非 | AFRICAN | African Bank |  |
| 南非 | ACCESS | Access Bank LTD |  |
| 南非 | TYME | Tyme Bank |  |
| 南非 | STD | Std Bank |  |
| 南非 | FNB | Fnb Bank |  |
| 南非 | ABSA | Absa Bank |  |
| 南非 | CAP | Capitec Bank |  |
| 南非 | NED | Ned bank |  |
| 南非 | DISCOVERY | Discovery Bank |  |

### 科特迪瓦

科特迪瓦

参数补充说明

  
  
  
  

👉 代付参数补充说明

| 参数名称 | 参数名 | 类型 | 可空 | 是否参与签名 | 说明 |
| --- | --- | --- | --- | --- | --- |
| 银行编码 | bankCode | string | 否 | 是 | 参考银行编码表 |

  
  

---

👉 银行编码说明

如果编码表银行编码(bankCode)里有“钱包编码”，则之后为钱包编码

| 国家 | 银行编码(bankCode) | 银行名称(bankName) | 银行全称 |
| --- | --- | --- | --- |
| 科特迪瓦 | 10001 | MTN |  |
| 科特迪瓦 | 10002 | orange |  |
| 科特迪瓦 | 10003 | wave |  |
| 科特迪瓦 | 10004 | moov |  |

### 尼日利亚

尼日利亚

参数补充说明

  
  
  
  

👉 代付参数补充说明

| 参数名称 | 参数名 | 类型 | 可空 | 是否参与签名 | 说明 |
| --- | --- | --- | --- | --- | --- |
| 银行编码 | bankCode | string | 否 | 是 | 参考银行编码表 |

  
  

---

👉 银行编码说明

如果编码表银行编码(bankCode)里有“钱包编码”，则之后为钱包编码

| 国家 | 银行编码(bankCode) | 银行名称(bankName) | 银行全称 |
| --- | --- | --- | --- |
| 尼日利亚 | 90133 | AL-Barakah Microfinance Bank |  |
| 尼日利亚 | 120001 | 9 Payment Service Bank |  |
| 尼日利亚 | 110005 | 3Line Card Management Limited |  |
| 尼日利亚 | 44 | Access Bank |  |
| 尼日利亚 | 90180 | AMJU Unique Microfinance Bank |  |
| 尼日利亚 | 90001 | ASOSavings & Loans |  |
| 尼日利亚 | 100028 | AG Mortgage Bank |  |
| 尼日利亚 | 70010 | Abbey Mortgage Bank |  |
| 尼日利亚 | 90116 | AMML MFB |  |
| 尼日利亚 | 90131 | Allworkers Microfinance Bank |  |
| 尼日利亚 | 90134 | Accion Microfinance Bank |  |
| 尼日利亚 | 90143 | Apeks Microfinance Bank |  |
| 尼日利亚 | 90160 | Addosser Microfinance Bank |  |
| 尼日利亚 | 90169 | Alpha Kapital Microfinance Bank |  |
| 尼日利亚 | 90172 | Astrapolaris Microfinance Bank |  |
| 尼日利亚 | 90197 | ABU Microfinance Bank |  |
| 尼日利亚 | 90259 | Alekun Microfinance Bank |  |
| 尼日利亚 | 90260 | Above Only Microfinance Bank |  |
| 尼日利亚 | 90264 | Auchi Microfinance Bank |  |
| 尼日利亚 | 90268 | Adeyemi College Staff Microfinance Bank |  |
| 尼日利亚 | 90270 | AB Microfinance Bank |  |
| 尼日利亚 | 90277 | Al-Hayat Microfinance Bank |  |
| 尼日利亚 | 100013 | AccessMobile |  |
| 尼日利亚 | 110011 | Arca Payments |  |
| 尼日利亚 | 90561 | Akuchukwu Microfinance Bank Ltd |  |
| 尼日利亚 | 90548 | Ally Microfinance Bank |  |
| 尼日利亚 | 90545 | Abulesoro Microfinance Bank Ltd |  |
| 尼日利亚 | 90544 | Aspire Microfinance Bank Ltd |  |
| 尼日利亚 | 90540 | Aztec Microfinance Bank |  |
| 尼日利亚 | 90531 | Aku Microfinance Bank |  |
| 尼日利亚 | 90518 | Afemai Microfinance Bank |  |
| 尼日利亚 | 90489 | Alvana Microfinance Bank |  |
| 尼日利亚 | 90483 | Ada Microfinance Bank |  |
| 尼日利亚 | 90478 | Avuenegbe Microfinance Bank |  |
| 尼日利亚 | 90476 | Anchorage Microfinance Bank |  |
| 尼日利亚 | 90473 | Assets Microfinance Bank |  |
| 尼日利亚 | 90469 | Aniocha Microfinance Bank |  |
| 尼日利亚 | 90451 | Atbu Microfinance Bank |  |
| 尼日利亚 | 90424 | Abucoop Microfinance Bank |  |
| 尼日利亚 | 90394 | Amac Microfinance Bank |  |
| 尼日利亚 | 90376 | Apple Microfinance Bank |  |
| 尼日利亚 | 90371 | Agosasa Microfinance Bank |  |
| 尼日利亚 | 90307 | Aramoko Microfinance Bank |  |
| 尼日利亚 | 90297 | Alert Microfinance Bank |  |
| 尼日利亚 | 90292 | Afekhafe Microfinance Bank |  |
| 尼日利亚 | 90287 | Assets Matrix Microfinance Bank |  |
| 尼日利亚 | 90282 | Arise Microfinance Bank |  |
| 尼日利亚 | 90202 | Accelerex Network |  |
| 尼日利亚 | 70025 | Akwa Savings & Loans Limited |  |
| 尼日利亚 | 50005 | Aaa Finance |  |
| 尼日利亚 | 90600 | AVE MARIA MICROFINANCE BANK LTD |  |
| 尼日利亚 | 90608 | Akpo Microfinance Bank |  |
| 尼日利亚 | 90610 | AMOYE MICROFINANCE BANK |  |
| 尼日利亚 | 37 | ALTERNATIVE BANK LIMITED |  |
| 尼日利亚 | 90393 | BRIDGEWAY MICROFINANCE BANK |  |
| 尼日利亚 | 70015 | Brent Mortgage Bank |  |
| 尼日利亚 | 90117 | Boctrust Microfinance Bank |  |
| 尼日利亚 | 90127 | BC Kash Microfinance Bank |  |
| 尼日利亚 | 90136 | Baobab Microfinance Bank |  |
| 尼日利亚 | 90148 | Bowen Microfinance Bank |  |
| 尼日利亚 | 90176 | Bosak Microfinance Bank |  |
| 尼日利亚 | 90188 | Baines Credit Microfinance Bank |  |
| 尼日利亚 | 110021 | Bud Infrastructure Limited |  |
| 尼日利亚 | 100052 | Beta-Access Yello |  |
| 尼日利亚 | 90568 | Broadview Microfinance Bank Ltd |  |
| 尼日利亚 | 90563 | Balera Microfinance Bank Ltd |  |
| 尼日利亚 | 90555 | Bishopgate Microfinance Bank |  |
| 尼日利亚 | 90538 | Blue Investments Microfinance Bank |  |
| 尼日利亚 | 90529 | Bankly Microfinance Bank |  |
| 尼日利亚 | 90512 | Bubayero Microfinance Bank |  |
| 尼日利亚 | 90508 | Borno Renaissance Microfinance Bank |  |
| 尼日利亚 | 90501 | Boromu Microfinance Bank |  |
| 尼日利亚 | 90494 | Boji Boji Microfinance Bank |  |
| 尼日利亚 | 90454 | Borstal Microfinance Bank |  |
| 尼日利亚 | 90444 | Boi Mf Bank |  |
| 尼日利亚 | 90431 | Bluewhales Microfinance Bank |  |
| 尼日利亚 | 90425 | Banex Microfinance Bank |  |
| 尼日利亚 | 90413 | Benysta Microfinance Bank |  |
| 尼日利亚 | 90406 | Business Support Microfinance Bank |  |
| 尼日利亚 | 90395 | Borgu Microfinance Bank |  |
| 尼日利亚 | 90336 | Bipc Microfinance Bank |  |
| 尼日利亚 | 90326 | Balogun Gambari Microfinance Bank |  |
| 尼日利亚 | 90319 | Bonghe Microfinance Bank |  |
| 尼日利亚 | 90316 | Bayero Microfinance Bank |  |
| 尼日利亚 | 90308 | Brightway Microfinance Bank |  |
| 尼日利亚 | 90293 | Brethren Microfinance Bank |  |
| 尼日利亚 | 90181 | Balogun Fulani Microfinance Bank |  |
| 尼日利亚 | 50006 | Branch International Financial Services |  |
| 尼日利亚 | 90581 | BANC CORP MICROFINANCE BANK |  |
| 尼日利亚 | 90615 | Beststar Microfinance Bank |  |
| 尼日利亚 | 23 | Citi Bank |  |
| 尼日利亚 | 70006 | Covenant Microfinance Bank |  |
| 尼日利亚 | 100032 | Contec Global Infotech Limited (NowNow) |  |
| 尼日利亚 | 60001 | Coronation Merchant Bank |  |
| 尼日利亚 | 90130 | Consumer Microfinance Bank |  |
| 尼日利亚 | 90141 | Chikum Microfinance Bank |  |
| 尼日利亚 | 90144 | CIT Microfinance Bank |  |
| 尼日利亚 | 90154 | CEMCS Microfinance Bank |  |
| 尼日利亚 | 90159 | Credit Afrique Microfinance Bank |  |
| 尼日利亚 | 100005 | Cellulant |  |
| 尼日利亚 | 303 | ChamsMobile |  |
| 尼日利亚 | 100026 | Carbon |  |
| 尼日利亚 | 110023 | Capricorn Digital |  |
| 尼日利亚 | 110017 | Crowdforce |  |
| 尼日利亚 | 110012 | Cellulant Pssp |  |
| 尼日利亚 | 90562 | Cedar Microfinance Bank Ltd |  |
| 尼日利亚 | 90553 | Consistent Trust Microfinance Bank Ltd |  |
| 尼日利亚 | 90530 | Confidence Microfinance Bank Ltd |  |
| 尼日利亚 | 90526 | Crescent Microfinance Bank |  |
| 尼日利亚 | 90523 | Chase Microfinance Bank |  |
| 尼日利亚 | 90511 | Cloverleaf Microfinance Bank |  |
| 尼日利亚 | 90509 | Capitalmetriq Swift Microfinance Bank |  |
| 尼日利亚 | 90498 | Catland Microfinance Bank |  |
| 尼日利亚 | 90490 | Chukwunenye Microfinance Bank |  |
| 尼日利亚 | 90472 | Caretaker Microfinance Bank |  |
| 尼日利亚 | 90445 | Capstone Mf Bank |  |
| 尼日利亚 | 90440 | Cherish Microfinance Bank |  |
| 尼日利亚 | 90429 | Crossriver Microfinance Bank |  |
| 尼日利亚 | 90416 | Chibueze Microfinance Bank |  |
| 尼日利亚 | 90415 | Calabar Microfinance Bank |  |
| 尼日利亚 | 90414 | Crutech Microfinance Bank |  |
| 尼日利亚 | 90397 | Chanelle Bank |  |
| 尼日利亚 | 90374 | Coastline Microfinance Bank |  |
| 尼日利亚 | 90365 | Corestep Microfinance Bank |  |
| 尼日利亚 | 90360 | Cashconnect Microfinance Bank |  |
| 尼日利亚 | 90343 | Citizen Trust Microfinance Bank Ltd |  |
| 尼日利亚 | 90254 | Coalcamp Microfinance Bank |  |
| 尼日利亚 | 70021 | Coop Mortgage Bank |  |
| 尼日利亚 | 50001 | County Finance Ltd |  |
| 尼日利亚 | 28 | Central Bank Of Nigeria |  |
| 尼日利亚 | 999001 | CBN\_TSA |  |
| 尼日利亚 | 110014 | Cyberspace Limited |  |
| 尼日利亚 | 90611 | Creditville Microfinance Bank |  |
| 尼日利亚 | 90649 | CASHRITE MICROFINANCE BANK |  |
| 尼日利亚 | 90167 | Daylight Microfinance Bank |  |
| 尼日利亚 | 90470 | DOT MICROFINANCE BANK |  |
| 尼日利亚 | 90391 | Davodani Microfinance Bank |  |
| 尼日利亚 | 70023 | Delta Trust Mortgage Bank |  |
| 尼日利亚 | 50013 | Dignity Finance |  |
| 尼日利亚 | 50 | EcoBank PLC |  |
| 尼日利亚 | 90328 | Eyowo MFB |  |
| 尼日利亚 | 100030 | EcoMobile |  |
| 尼日利亚 | 100021 | Eartholeum |  |
| 尼日利亚 | 19 | Enterprise Bank |  |
| 尼日利亚 | 90097 | Ekondo MFB |  |
| 尼日利亚 | 90114 | Empire trust MFB |  |
| 尼日利亚 | 90156 | e-Barcs Microfinance Bank |  |
| 尼日利亚 | 90166 | Eso-E Microfinance Bank |  |
| 尼日利亚 | 90189 | Esan Microfinance Bank |  |
| 尼日利亚 | 90273 | Emeralds Microfinance Bank |  |
| 尼日利亚 | 100006 | eTranzact |  |
| 尼日利亚 | 100008 | Ecobank Xpress Account |  |
| 尼日利亚 | 33 | ENaira |  |
| 尼日利亚 | 90572 | Ewt Microfinance Bank |  |
| 尼日利亚 | 90556 | Egwafin Microfinance Bank Ltd |  |
| 尼日利亚 | 90552 | Ekimogun Microfinance Bank |  |
| 尼日利亚 | 90541 | Excellent Microfinance Bank |  |
| 尼日利亚 | 90539 | Enrich Microfinance Bank |  |
| 尼日利亚 | 90427 | Ebsu Microfinance Bank |  |
| 尼日利亚 | 90389 | Ek-Reliable Microfinance Bank |  |
| 尼日利亚 | 90332 | Evergreen Microfinance Bank |  |
| 尼日利亚 | 90310 | Edfin Microfinance Bank |  |
| 尼日利亚 | 90304 | Evangel Microfinance Bank |  |
| 尼日利亚 | 90294 | Eagle Flight Microfinance Bank |  |
| 尼日利亚 | 50012 | Enco Finance |  |
| 尼日利亚 | 11 | First Bank PLC |  |
| 尼日利亚 | 214 | First City Monument Bank |  |
| 尼日利亚 | 70 | Fidelity Bank |  |
| 尼日利亚 | 608 | FINATRUST MICROFINANCE BANK |  |
| 尼日利亚 | 400001 | FSDH Merchant Bank |  |
| 尼日利亚 | 100031 | FCMB Easy Account |  |
| 尼日利亚 | 100019 | Fidelity Mobile |  |
| 尼日利亚 | 60002 | FBNQUEST Merchant Bank |  |
| 尼日利亚 | 90107 | FBN Mortgages Limited |  |
| 尼日利亚 | 70014 | First Generation Mortgage Bank |  |
| 尼日利亚 | 70002 | Fortis Microfinance Bank |  |
| 尼日利亚 | 90126 | Fidfund Microfinance Bank |  |
| 尼日利亚 | 90145 | Fullrange Microfinance Bank |  |
| 尼日利亚 | 90153 | FFS Microfinance Bank |  |
| 尼日利亚 | 90158 | Futo Microfinance Bank |  |
| 尼日利亚 | 90164 | First Royal Microfinance Bank |  |
| 尼日利亚 | 90179 | FAST Microfinance Bank |  |
| 尼日利亚 | 100001 | FET |  |
| 尼日利亚 | 100014 | FBNMobile |  |
| 尼日利亚 | 100016 | FortisMobile |  |
| 尼日利亚 | 110002 | Flutterwave Technology Solutions Limited |  |
| 尼日利亚 | 90366 | Firmus MFB |  |
| 尼日利亚 | 90482 | FEDETH MICROFINANCE BANK |  |
| 尼日利亚 | 90575 | Firstmidas Microfinance Bank Ltd |  |
| 尼日利亚 | 90551 | Fairmoney Microfinance Bank Ltd |  |
| 尼日利亚 | 90521 | Foresight Microfinance Bank |  |
| 尼日利亚 | 90507 | Fims Microfinance Bank |  |
| 尼日利亚 | 90486 | Fortress Microfinance Bank |  |
| 尼日利亚 | 90479 | First Heritage Microfinance Bank |  |
| 尼日利亚 | 90438 | Futminna Microfinance Bank |  |
| 尼日利亚 | 90409 | Fcmb Microfinance Bank |  |
| 尼日利亚 | 90400 | Finca Microfinance Bank |  |
| 尼日利亚 | 90398 | Federal Polytechnic Nekede Microfinance Bank |  |
| 尼日利亚 | 90330 | Fame Microfinance Bank |  |
| 尼日利亚 | 90318 | Federal University Dutse Microfinance Bank |  |
| 尼日利亚 | 90298 | Federalpoly Nasarawamfb |  |
| 尼日利亚 | 90290 | Fct Microfinance Bank |  |
| 尼日利亚 | 90285 | First Option Microfinance Bank |  |
| 尼日利亚 | 90163 | First Multiple Microfinance Bank |  |
| 尼日利亚 | 70026 | Fha Mortgage Bank Ltd |  |
| 尼日利亚 | 50002 | Fewchore Finance Company Limited |  |
| 尼日利亚 | 90614 | FLOURISH MFB |  |
| 尼日利亚 | 110004 | First Apple Limited |  |
| 尼日利亚 | 50009 | FAST CREDIT |  |
| 尼日利亚 | 50010 | FUNDQUEST FINANCIAL SERVICES LTD |  |
| 尼日利亚 | 58 | Guaranty Trust Bank |  |
| 尼日利亚 | 27 | Globus Bank |  |
| 尼日利亚 | 100022 | GoMoney |  |
| 尼日利亚 | 70009 | Gateway Mortgage Bank |  |
| 尼日利亚 | 90122 | Gowans Microfinance Bank |  |
| 尼日利亚 | 90168 | Gashua Microfinance Bank |  |
| 尼日利亚 | 90178 | GreenBank Microfinance Bank |  |
| 尼日利亚 | 90195 | Grooming Microfinance Bank |  |
| 尼日利亚 | 90269 | Greenville Microfinance Bank |  |
| 尼日利亚 | 100009 | GTMobile |  |
| 尼日利亚 | 60004 | Greenwich Merchant Bank |  |
| 尼日利亚 | 90495 | GOODNEWS MFB |  |
| 尼日利亚 | 90579 | Gbede Microfinance Bank |  |
| 尼日利亚 | 90550 | Green Energy Microfinance Bank Ltd |  |
| 尼日利亚 | 90500 | Gwong Microfinance Bank |  |
| 尼日利亚 | 90484 | Garki Microfinance Bank |  |
| 尼日利亚 | 90475 | Giant Stride Microfinance Bank |  |
| 尼日利亚 | 90467 | Good Neighbours Microfinance Bank |  |
| 尼日利亚 | 90441 | Giwa Microfinance Bank |  |
| 尼日利亚 | 90408 | Gmb Microfinance Bank |  |
| 尼日利亚 | 90385 | Gti Microfinance Bank |  |
| 尼日利亚 | 90278 | Glory Microfinance Bank |  |
| 尼日利亚 | 90186 | Girei Microfinance Bank |  |
| 尼日利亚 | 90335 | Grant MF Bank |  |
| 尼日利亚 | 90586 | GOMBE MICROFINANCE BANK LTD |  |
| 尼日利亚 | 90574 | GOLDMAN MICROFINANCE BANK |  |
| 尼日利亚 | 90591 | Gabsyn Microfinance Bank |  |
| 尼日利亚 | 90599 | Greenacres MFB |  |
| 尼日利亚 | 90621 | GIDAUNIYAR ALHERI MICROFINANCE BANK |  |
| 尼日利亚 | 30 | Heritage Bank |  |
| 尼日利亚 | 70017 | Haggai Mortgage Bank Limited |  |
| 尼日利亚 | 90121 | Hasal Microfinance Bank |  |
| 尼日利亚 | 90147 | Hackman Microfinance Bank |  |
| 尼日利亚 | 90175 | HighStreet Microfinance Bank |  |
| 尼日利亚 | 100017 | Hedonmark |  |
| 尼日利亚 | 120002 | Hopepsb |  |
| 尼日利亚 | 90418 | Highland Microfinance Bank |  |
| 尼日利亚 | 90363 | Headway Microfinance Bank |  |
| 尼日利亚 | 90291 | Halacredit Microfinance Bank |  |
| 尼日利亚 | 70024 | Homebase Mortgage |  |
| 尼日利亚 | 100027 | Intellifin |  |
| 尼日利亚 | 100029 | Innovectives Kesh |  |
| 尼日利亚 | 100024 | Imperial Homes Mortgage Bank |  |
| 尼日利亚 | 70016 | Infinity Trust Mortgage Bank |  |
| 尼日利亚 | 90118 | IBILE Microfinance Bank |  |
| 尼日利亚 | 90149 | IRL Microfinance Bank |  |
| 尼日利亚 | 90157 | Infinity Microfinance Bank |  |
| 尼日利亚 | 90258 | Imo State Microfinance Bank |  |
| 尼日利亚 | 110010 | Interswitch Financial Inclusion Services (Ifis) |  |
| 尼日利亚 | 110003 | Interswitch Limited |  |
| 尼日利亚 | 90578 | Iwade Microfinance Bank Ltd |  |
| 尼日利亚 | 90571 | Ilaro Poly Microfinance Bank Ltd |  |
| 尼日利亚 | 90570 | Iyamoye Microfinance Bank Ltd |  |
| 尼日利亚 | 90546 | Ijebu-Ife Microfinance Bank Ltd |  |
| 尼日利亚 | 90543 | Iwoama Microfinance Bank |  |
| 尼日利亚 | 90536 | Ikoyi-Osun Microfinance Bank |  |
| 尼日利亚 | 90532 | Ibolo Micorfinance Bank Ltd |  |
| 尼日利亚 | 90520 | Ic Globalmicrofinance Bank |  |
| 尼日利亚 | 90519 | Ibom Fadama Microfinance Bank |  |
| 尼日利亚 | 90493 | Iperu Microfinance Bank |  |
| 尼日利亚 | 90488 | Ibu-Aje Microfinance |  |
| 尼日利亚 | 90439 | Ibeto Microfinance Bank |  |
| 尼日利亚 | 90434 | Insight Microfinance Bank |  |
| 尼日利亚 | 90430 | Ilora Microfinance Bank |  |
| 尼日利亚 | 90428 | Ishie Microfinance Bank |  |
| 尼日利亚 | 90421 | Izon Microfinance Bank |  |
| 尼日利亚 | 90417 | Imowo Microfinance Bank |  |
| 尼日利亚 | 90386 | Interland Microfinance Bank |  |
| 尼日利亚 | 90377 | Isaleoyo Microfinance Bank |  |
| 尼日利亚 | 90370 | Ilasan Microfinance Bank |  |
| 尼日利亚 | 90353 | Isuofia Microfinance Bank |  |
| 尼日利亚 | 90350 | Illorin Microfinance Bank |  |
| 尼日利亚 | 90337 | Iyeru Okin Microfinance Bank Ltd |  |
| 尼日利亚 | 90324 | Ikenne Microfinance Bank |  |
| 尼日利亚 | 90279 | Ikire Microfinance Bank |  |
| 尼日利亚 | 90211 | Itex Integrated Services Limited |  |
| 尼日利亚 | 90584 | ISLAND MICROFINANCE BANK |  |
| 尼日利亚 | 90598 | IBA MFB |  |
| 尼日利亚 | 301 | Jaiz Bank |  |
| 尼日利亚 | 90003 | Jubilee-Life Mortgage Bank |  |
| 尼日利亚 | 90352 | Jessefield Microfinance Bank |  |
| 尼日利亚 | 82 | Keystone Bank |  |
| 尼日利亚 | 90267 | Kuda |  |
| 尼日利亚 | 90191 | KCMB Microfinance Bank |  |
| 尼日利亚 | 100015 | Kegow |  |
| 尼日利亚 | 110022 | Koraypay |  |
| 尼日利亚 | 110008 | Kadick Integration Limited |  |
| 尼日利亚 | 100036 | Kegow(Chamsmobile) |  |
| 尼日利亚 | 90554 | Kayvee Microfinance Bank |  |
| 尼日利亚 | 90549 | Kc Microfinance Bank |  |
| 尼日利亚 | 90487 | Kingdom College Microfinance Bank |  |
| 尼日利亚 | 90480 | KOLOMONI MICROFINANCE BANK |  |
| 尼日利亚 | 90450 | Kwasu Mf Bank |  |
| 尼日利亚 | 90380 | Kredi Money Microfinance Bank |  |
| 尼日利亚 | 90320 | Kadpoly Microfinance Bank |  |
| 尼日利亚 | 90299 | Kontagora Microfinance Bank |  |
| 尼日利亚 | 90592 | KANO POLY MFB |  |
| 尼日利亚 | 90602 | KENECHUKWU MICROFINANCE BANK |  |
| 尼日利亚 | 90606 | KKU Microfinance Bank |  |
| 尼日利亚 | 70012 | Lagos Building Investment Company |  |
| 尼日利亚 | 90155 | La Fayette Microfinance Bank |  |
| 尼日利亚 | 90177 | Lapo Microfinance Bank |  |
| 尼日利亚 | 90265 | Lovonus Microfinance Bank |  |
| 尼日利亚 | 90271 | Lavender Microfinance Bank |  |
| 尼日利亚 | 90420 | Letshego MFB |  |
| 尼日利亚 | 90435 | Links Microfinance Bank |  |
| 尼日利亚 | 90557 | Lifegate Microfinance Bank Ltd |  |
| 尼日利亚 | 90537 | Lobrem Microfinance Bank |  |
| 尼日利亚 | 90477 | Light Microfinance Bank |  |
| 尼日利亚 | 90422 | Landgold Microfinance Bank |  |
| 尼日利亚 | 90372 | Legend Microfinance Bank |  |
| 尼日利亚 | 29 | Lotus Bank |  |
| 尼日利亚 | 110044 | Leadremit Limited |  |
| 尼日利亚 | 90620 | LOMA Microfinance Bank |  |
| 尼日利亚 | 90281 | Mint-Finex MICROFINEX BANK |  |
| 尼日利亚 | 100020 | MoneyBox |  |
| 尼日利亚 | 90129 | Money Trust Microfinance Bank |  |
| 尼日利亚 | 90151 | Mutual Trust Microfinance Bank |  |
| 尼日利亚 | 90171 | Mainstreet Microfinance Bank |  |
| 尼日利亚 | 90174 | Malachy Microfinance Bank |  |
| 尼日利亚 | 90190 | Mutual Benefits Microfinance Bank |  |
| 尼日利亚 | 90192 | Midland Microfinance Bank |  |
| 尼日利亚 | 100011 | Mkudi |  |
| 尼日利亚 | 90423 | MAUTECH Microfinance Bank |  |
| 尼日利亚 | 90383 | Manny Microfinance bank |  |
| 尼日利亚 | 100035 | M36 |  |
| 尼日利亚 | 120005 | Money Master Psb |  |
| 尼日利亚 | 120003 | Momo Psb |  |
| 尼日利亚 | 110018 | Microsystems Investment And Development Limited |  |
| 尼日利亚 | 90528 | Mgbidi Microfinance Bank |  |
| 尼日利亚 | 90465 | Maintrust Microfinance Bank |  |
| 尼日利亚 | 90462 | Monarch Microfinance Bank |  |
| 尼日利亚 | 90448 | Moyofade Mf Bank |  |
| 尼日利亚 | 90432 | Memphis Microfinance Bank |  |
| 尼日利亚 | 90410 | Maritime Microfinance Bank |  |
| 尼日利亚 | 90405 | Moniepoint Microfinance Bank |  |
| 尼日利亚 | 90392 | Mozfin Microfinance Bank |  |
| 尼日利亚 | 90362 | Molusi Microfinance Bank |  |
| 尼日利亚 | 90323 | Mainland Microfinance Bank |  |
| 尼日利亚 | 90321 | Mayfair Microfinance Bank |  |
| 尼日利亚 | 90280 | Megapraise Microfinance Bank |  |
| 尼日利亚 | 90275 | Meridian Microfinance Bank |  |
| 尼日利亚 | 90113 | Microvis Microfinance Bank |  |
| 尼日利亚 | 70019 | Mayfresh Mortgage Bank |  |
| 尼日利亚 | 90589 | Mercury MFB |  |
| 尼日利亚 | 90587 | Microbiz Microfinance Bank |  |
| 尼日利亚 | 90455 | MKOBO MICROFINANCE BANK LTD |  |
| 尼日利亚 | 90603 | Macrod MFB |  |
| 尼日利亚 | 90612 | Medef Microfinance Bank |  |
| 尼日利亚 | 90623 | Mab Allianz MFB |  |
| 尼日利亚 | 90659 | MICHAEL OKPARA UNIAGRIC MICROFINANCE BANK |  |
| 尼日利亚 | 70001 | NPF MicroFinance Bank |  |
| 尼日利亚 | 60003 | Nova Merchant Bank |  |
| 尼日利亚 | 90108 | New Prudential Bank |  |
| 尼日利亚 | 90128 | Ndiorah Microfinance Bank |  |
| 尼日利亚 | 90152 | Nagarta Microfinance Bank |  |
| 尼日利亚 | 90194 | NIRSAL Microfinance Bank |  |
| 尼日利亚 | 90205 | New Dawn Microfinance Bank |  |
| 尼日利亚 | 90263 | Navy Microfinance Bank |  |
| 尼日利亚 | 999999 | NIP Virtual Bank |  |
| 尼日利亚 | 110028 | Nomba Financial Services Limited |  |
| 尼日利亚 | 110025 | Netapps Technology Limited |  |
| 尼日利亚 | 110019 | Nibssussd Payments |  |
| 尼日利亚 | 90535 | Nkpolu-Ust Microfinance |  |
| 尼日利亚 | 90516 | Numo Microfinance Bank |  |
| 尼日利亚 | 90505 | Nigeria Prisonsmicrofinance Bank |  |
| 尼日利亚 | 90491 | Nsuk Microfinance Bank |  |
| 尼日利亚 | 90459 | Nice Microfinance Bank |  |
| 尼日利亚 | 90399 | Nwannegadi Microfinance Bank |  |
| 尼日利亚 | 90378 | New Golden Pastures Microfinance Bank |  |
| 尼日利亚 | 90364 | Nuture Microfinance Bank |  |
| 尼日利亚 | 90349 | Nasarawa Microfinance Bank |  |
| 尼日利亚 | 90329 | Neptune Microfinance Bank |  |
| 尼日利亚 | 50004 | Newedge Finance Ltd |  |
| 尼日利亚 | 100026 |

### 洪都拉斯

洪都拉斯

参数补充说明

  
  
  
  

👉 代付参数补充说明

| 参数名称 | 参数名 | 类型 | 可空 | 是否参与签名 | 说明 |
| --- | --- | --- | --- | --- | --- |
| 银行编码 | bankCode | string | 否 | 是 | 参考银行编码表 |

  
  

---

👉 银行编码说明

如果编码表银行编码(bankCode)里有“钱包编码”，则之后为钱包编码

| 国家 | 银行编码(bankCode) | 银行名称(bankName) | 银行全称 |
| --- | --- | --- | --- |
| 洪都拉斯 | Banco Ficohsa | Banco Ficohsa |  |
| 洪都拉斯 | Banco Banpais | Banco Banpais |  |
| 洪都拉斯 | Banco Atlántida | Banco Atlántida |  |
| 洪都拉斯 | Banco Lafise | Banco Lafise |  |
